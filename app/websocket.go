package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gofrs/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

var clients = make(map[*websocket.Conn]bool)      // Connected clients
var roomBroadcasts = make(map[string]chan []byte) // Broadcast channel
var mu = &sync.Mutex{}                            // Protect clients map

func handleWebsocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade the HTTP connection to a WebSocket connection
	conn, err := upgrdr.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("Error upgrading:", err)
		return
	}
	// bug: we're closing connection before goroutines can use it
	// as the defer is reached since the goroutines won't block
	defer conn.Close()

	// init/handshake/connection start flow
	// 1. Check if user sent user_id
	// 2. if user_id find user reference in users
	// 3. if not create user object and append in users
	// 4. Check if user sent canvas_id
	// 5. if canvas_id find canvas ref in canvases
	// 6. find room associated with canvas
	// 7. if room, create client and subscribe to room
	// 8. if not, create room and client and subscribe client to newly created room
	// 6. if no canvas_id, create canvas, room, client and do appropriate appends and subscription

	//// for #1 we'll do a pre-read, first user message is either a NewCanvas or ConnectToCanvas
	//// ConnectToCanvas will be treated differently if the connection is active?
	///// Check said canvas and find if an exisitng room is there, otherwise create the room for the canvas

	_, message, err := conn.ReadMessage()
	if err != nil {
		if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
			log.Printf("error: %v", err)
		}
	}

	var initMessage Message
	json.Unmarshal(message, &initMessage)

	// Of course the lookups will be replaced with db queries later
	// but we're testing with in-memory data for now
	var canvas *Canvas
	var user *User
	if initMessage.Type == ConnectToCanvas || initMessage.Type == NewCanvas {
		switch initMessage.Type {
		case NewCanvas:
			var newCanvasMsg NewCanvasMessage
			{
				canvas = &Canvas{}
				json.Unmarshal(initMessage.Data, &newCanvasMsg)
				canvas.Id = uuid.Must(uuid.NewV4()).String()

				if len(newCanvasMsg.UserId) > 0 {
					mu.Lock()
					for _, u := range users {
						if u.Id == newCanvasMsg.UserId {
							u.CurrentCanvasId = canvas.Id
							canvas.OwnerId = u.Id
							user = u
						}
					}
					canvases = append(canvases, canvas)
					mu.Unlock()
					break
				}
				user = &User{}
				user.Id = uuid.Must(uuid.NewV4()).String()
				user.CurrentCanvasId = canvas.Id
				user.Present = true
				canvas.OwnerId = user.Id
				mu.Lock()
				users = append(users, user)
				canvases = append(canvases, canvas)
				mu.Unlock()
				break
			}
		case ConnectToCanvas:
			var ctcMessage ConnectToCanvasMessage
			json.Unmarshal(initMessage.Data, &ctcMessage)
			mu.Lock()
			for _, cnv := range canvases {
				if cnv.Id == ctcMessage.CanvasId {
					canvas = cnv
					break
				}
			}
			mu.Unlock()
			if canvas == nil {
				// TODO: handle canvas not found
				break
			}
			if len(ctcMessage.UserId) > 0 {
				for _, u := range users {
					if u.Id == ctcMessage.UserId {
						u.CurrentCanvasId = canvas.Id
						user = u
					}
				}
				break
			}
			user = &User{}
			user.Id = uuid.Must(uuid.NewV4()).String()
			user.CurrentCanvasId = canvas.Id
			user.Present = true
			users = append(users, user)
		default:
			// only NewCanvas and CTC are init messages
			break
		}
	} else {
		// TODO: handle wrong init message
	}

	var room *Room
	if canvas != nil {
		mu.Lock()
		for _, r := range socketRooms {
			if r.CanvasId == canvas.Id {
				room = r
			}
		}
		mu.Unlock()
		if room == nil {
			room = &Room{
				CanvasId:  canvas.Id,
				Broadcast: make(chan []byte),
			}
			socketRooms = append(socketRooms, room)
		}
	}

	// go handleRead(conn, userId)
	// go handleWrite(conn, userId)
}

func handleRead(conn *websocket.Conn, userId int) {
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			mu.Lock()
			delete(clients, conn)
			mu.Unlock()
			fmt.Println("Error reading message:", err)
		}
		fmt.Printf("Received: %s\n", message)

		var jsonData RoomData
		json.Unmarshal(message, &jsonData)

		roomId := jsonData.Id
		rooms[roomId] = jsonData
		userRoom[userId] = roomId

		if roomUsers[roomId] != nil {
			roomUsers[roomId][userId] = true
		} else {
			roomUsers[roomId] = make(map[int]any)
			roomUsers[roomId][userId] = true
		}

		roomBroadcasts[roomId] <- message

		for k, v := range userOutChannels {
			if k != userId {
				_, exists := roomUsers[roomId][k]
				if exists {
					v <- []byte("updated")
				}
			}
		}
	}
}

func handleWrite(conn *websocket.Conn, userId int) {
	for {
		// for msg := range userOutChannels[userId] {
		// 	if string(msg) == "updated" {
		// 		data, err := json.Marshal(rooms[userRoom[userId]])
		// 		if err != nil {
		// 			log.Println(err)
		// 		}
		// 		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		// 			fmt.Println("Error writing message:", err)
		// 			break
		// 		}
		// 	}
		// }

		message := <-roomBroadcasts[userRoom[userId]]

		mu.Lock()
		for client := range clients {
			err := client.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				client.Close()
				delete(clients, client)
			}
		}
		mu.Unlock()
	}
}
