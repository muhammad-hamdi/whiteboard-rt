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
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

var mu = &sync.Mutex{} // Protect clients map

func handleWebsocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade the HTTP connection to a WebSocket connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("Error upgrading:", err)
		return
	}

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
	userCreated := false
	if initMessage.Type == ConnectToCanvas || initMessage.Type == NewCanvas {
		switch initMessage.Type {
		case NewCanvas:
			d, _ := json.Marshal(initMessage.Data)
			var newCanvasMsg NewCanvasMessage
			json.Unmarshal(d, &newCanvasMsg)
			{
				canvas = &Canvas{
					Id: uuid.Must(uuid.NewV4()).String(),
					Snapshot: &CanvasData{
						Shapes:       []*Shape{},
						Text:         []*Text{},
						BrushStrokes: []*BrushStroke{},
					},
					EventLog: []*Event{},
				}

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
					if user != nil {
						break
					}
				}
				userCreated = true
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
			d, _ := json.Marshal(initMessage.Data)
			var ctcMessage ConnectToCanvasMessage
			json.Unmarshal(d, &ctcMessage)
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
				if user != nil {
					break
				}
			}
			userCreated = true
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

	if canvas == nil {
		// TODO: handle later, maybe in a loop for(canvas == nil) with try count
		return
	}

	var room *Room
	mu.Lock()
	for _, r := range socketRooms {
		if r.CanvasId == canvas.Id {
			room = r
		}
	}
	mu.Unlock()
	if room == nil {
		room = newRoom(canvas.Id)
		go room.run()
		mu.Lock()
		socketRooms = append(socketRooms, room)
		mu.Unlock()
	}

	client := &Client{room: room, user: user, conn: conn, send: make(chan []byte, 256)}
	room.register <- client

	canvasCreatedEvent := CanvasCreatedMessage{
		Canvas: *canvas,
	}
	data, _ := json.Marshal(canvasCreatedEvent)
	resMessage := Message{
		Type: CanvasCreated,
		Data: data,
	}
	data, _ = json.Marshal(resMessage)
	client.send <- data

	if userCreated {
		userCreatedEvent := UserCreatedMessage{
			User: *user,
		}
		data, _ := json.Marshal(userCreatedEvent)
		message := Message{
			Type: UserCreated,
			Data: data,
		}
		data, _ = json.Marshal(message)
		client.send <- data
	}

	go client.readPump()
	go client.writePump()
}
