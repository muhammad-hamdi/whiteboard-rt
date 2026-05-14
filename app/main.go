package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
)

var (
	outgoing        chan []byte
	rooms           map[string]RoomData
	userIdCounter   = 0
	userOutChannels map[int]chan []byte
	roomUsers       map[string]map[int]any
	userRoom        map[int]string
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

		roomId := jsonData.Id
		rooms[roomId] = jsonData
		userRoom[userId] = roomId

		if roomUsers[roomId] != nil {
			roomUsers[roomId][userId] = true
		} else {
			roomUsers[roomId] = make(map[int]any)
			roomUsers[roomId][userId] = true
		}

		for k, v := range userOutChannels {
			if k != userId {
				_, exists := roomUsers[roomId][k]
				if exists {
					v <- []byte("updated")
				}
			}
		}
	}
	conn.Close()
	fmt.Println("-------------")
}

func writeLoop(conn net.Conn, out <-chan []byte, userId int) {
	for msg := range userOutChannels[userId] {
		if string(msg) == "updated" {
			data, err := json.Marshal(rooms[userRoom[userId]])
			fmt.Println(userRoom[userId])
			if err != nil {
				log.Println(err)
			}
			frame := []byte{
				0x81,
				byte(len(data)),
			}
			frame = append(frame, data...)
			conn.Write(frame)
		}
	}
}

func main() {

	router := http.NewServeMux()

	rooms = make(map[string]RoomData)
	outgoing = make(chan []byte)
	roomUsers = make(map[string]map[int]any)
	userRoom = make(map[int]string)
	userOutChannels = make(map[int]chan []byte)

	fs := http.FileServer(http.Dir("./ui/static"))

	router.Handle("GET /static/", http.StripPrefix("/static", fs))

	router.HandleFunc("GET /", home)

	router.HandleFunc("GET /websocket", handleWebsocket)

	log.Println("Starting server at http://localhost:3000")

	err := http.ListenAndServe("localhost:3000", router)
	if err != nil {
		log.Fatalf("Error starting server: %s", err)
	}
}
