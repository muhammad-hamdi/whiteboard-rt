package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

var clients = make(map[*websocket.Conn]bool)      // Connected clients
var roomBroadcasts = make(map[string]chan []byte) // Broadcast channel
var mutex = &sync.Mutex{}                         // Protect clients map

func handleWebsocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade the HTTP connection to a WebSocket connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("Error upgrading:", err)
		return
	}
	// bug: we're closing connection before goroutines can use it
	// as the defer is reached since the goroutines won't block
	defer conn.Close()

	// TODO: look at https://github.com/gorilla/websocket/blob/main/examples/chat/README.md
	// and replace current conn defer and client model with thiers

	mutex.Lock()
	clients[conn] = true
	mutex.Unlock()

	userId := userIdCounter
	userIdCounter++
	log.Println("User ", userId)

	go handleRead(conn, userId)
	go handleWrite(conn, userId)
}

func handleRead(conn *websocket.Conn, userId int) {
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			mutex.Lock()
			delete(clients, conn)
			mutex.Unlock()
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

		mutex.Lock()
		for client := range clients {
			err := client.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				client.Close()
				delete(clients, client)
			}
		}
		mutex.Unlock()
	}
}
