package main

import (
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
)

type Vec2 struct {
	x float32
	y float32
}

type RoomData struct {
	id           string
	cameraTarget Vec2
}

var (
	outgoing        chan []byte
	rooms           map[string]RoomData
	userIdCounter   = 0
	userRoom        map[int]string
	roomUsers       map[string]map[int]bool
	roomUpdateCount map[string]int
	mu              sync.Mutex
)

func getPayloadFromMask(buf []byte, length uint64, m uint8) []byte {
	var encodedPayload []byte

	if length <= 125 {
		if m == 1 {
			mask := buf[2:6]
			encodedPayload = buf[6 : 6+length]

			for i := range encodedPayload {
				encodedPayload[i] = encodedPayload[i] ^ mask[i%4]
			}
		}
	} else if length == 126 {
		length = uint64(uint16(buf[2])<<8 + uint16(buf[3]))
		if m == 1 {
			mask := buf[4:8]
			encodedPayload = buf[8 : 8+length]

			for i := range encodedPayload {
				encodedPayload[i] = encodedPayload[i] ^ mask[i%4]
			}
		}
	} else if length == 127 {
		length = uint64(buf[2])<<32 + uint64(buf[3])<<16 + uint64(buf[4])<<8 + uint64(buf[5])
		if m == 1 {
			mask := buf[10:14]
			encodedPayload = buf[14 : 14+length]

			for i := range encodedPayload {
				encodedPayload[i] = encodedPayload[i] ^ mask[i%4]
			}
		}
	}

	return encodedPayload
}

func readLoop(conn net.Conn, userId int) {
	for {
		buf := make([]byte, 4*4096)

		_, err := conn.Read(buf)
		if err != nil {
			return
		}

		var opcode = buf[0] & 0x0F
		if opcode == 0x8 {
			break
		}
		var m uint8 = buf[1] >> 7
		var length uint64 = uint64(buf[1] & 0b01111111)

		payload := getPayloadFromMask(buf, length, m)
		fmt.Println(string(payload))

		var jsonData RoomData
		json.Unmarshal(payload, &jsonData)
		fmt.Println(jsonData)

		fmt.Println(rooms)
		roomId := jsonData.id
		mu.Lock()
		rooms[roomId] = jsonData
		userRoom[userId] = roomId

		if roomUsers[roomId] != nil {
			roomUsers[roomId][userId] = true
		} else {
			roomUsers[roomId] = make(map[int]bool)
			roomUsers[roomId][userId] = true
		}

		roomUpdateCount[roomId] = len(roomUsers[roomId])
		mu.Unlock()

		fmt.Println(rooms)
		fmt.Println(len(rooms))

		// outgoing <- payload

		// fmt.Println("Received: ", n, fin, opcode)
	}
	conn.Close()
	fmt.Println("-------------")
}

func writeLoop(conn net.Conn, out <-chan []byte, userId int) {
	for {
		mu.Lock()
		rId := userRoom[userId]
		room := rooms[rId]
		if roomUpdateCount[rId] > 0 {
			if !roomUsers[rId][userId] {
				msg, err := json.Marshal(room)
				if err != nil {
					log.Println(err)
				}
				frame := []byte{
					0x81,
					byte(len(msg)),
				}
				frame = append(frame, msg...)
				conn.Write(frame)
			}
			roomUsers[rId][userId] = false
			roomUpdateCount[rId]--
		}
		mu.Unlock()
	}
	// for msg := range out {
	// 	frame := []byte{
	// 		0x81,
	// 		byte(len(msg)),
	// 	}
	// 	frame = append(frame, msg...)
	// 	conn.Write(frame)
	// }
}

func main() {

	router := http.NewServeMux()

	rooms = make(map[string]RoomData)
	outgoing = make(chan []byte)
	userRoom = make(map[int]string)
	roomUpdateCount = make(map[string]int)
	roomUsers = make(map[string]map[int]bool)

	fs := http.FileServer(http.Dir("./ui/static"))

	router.Handle("GET /static/", http.StripPrefix("/static", fs))

	router.HandleFunc("GET /", home)

	router.HandleFunc("GET /websocket", func(w http.ResponseWriter, r *http.Request) {
		const wsMagicString = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
		wsKey := r.Header.Get("Sec-WebSocket-Key")

		hasher := sha1.New()
		hasher.Write([]byte(wsKey + wsMagicString))

		sha1Sum := hasher.Sum(nil)

		acceptKey := base64.StdEncoding.EncodeToString(sha1Sum)

		w.Header().Add("Sec-WebSocket-Accept", acceptKey)
		w.Header().Add("Connection", "Upgrade")
		w.Header().Add("Upgrade", "websocket")
		w.WriteHeader(http.StatusSwitchingProtocols)

		// hijack tcp
		hj, ok := w.(http.Hijacker)
		if !ok {
			return
		}

		conn, _, err := hj.Hijack()
		if err != nil {
			log.Print(err.Error())
		}

		user := userIdCounter
		userIdCounter++

		go readLoop(conn, user)
		go writeLoop(conn, outgoing, user)
	})

	log.Println("Starting server at http://localhost:3000")

	err := http.ListenAndServe("localhost:3000", router)
	if err != nil {
		log.Fatalf("Error starting server: %s", err)
	}
}
