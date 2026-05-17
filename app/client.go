// Copyright 2013 The Gorilla WebSocket Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package main

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gofrs/uuid"
	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 512
)

var (
	newline = []byte{'\n'}
	space   = []byte{' '}
)

// Client is a middleman between the websocket connection and the room.
type Client struct {
	room *Room

	user *User

	// The websocket connection.
	conn *websocket.Conn

	// Buffered channel of outbound messages.
	send chan []byte
}

// readPump pumps messages from the websocket connection to the room.
//
// The application runs readPump after connection init messages like NewCanvas or ConnectToCanvas.
// The application ensures that there is at most one reader on
// a connection by executing all reads from this goroutine.
func (c *Client) readPump() {
	defer func() {
		c.room.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error { c.conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		// TODO: move the parsing and responses to a map
		// or vtable like thing -> map[MessageType]func(data json.RawMessage)

		var msg Message
		json.Unmarshal(message, &msg)
		switch msg.Type {
		case NewCanvas:
		case ConnectToCanvas:
		case CursorUpdate:
		case RectCreate:
			{
				var s Shape
				json.Unmarshal(msg.Data, &s)
				s.Id = uuid.Must(uuid.NewV4()).String()
				data, _ := json.Marshal(s)

				var canvas *Canvas

				mu.Lock()
				for _, cnv := range canvases {
					if cnv.Id == c.user.CurrentCanvasId {
						canvas = cnv
					}
				}
				if canvas == nil {
					// TODO: handle nil canvas
				}
				if canvas.Snapshot == nil {
					canvas.Snapshot = &CanvasData{}
				}
				if canvas.Snapshot.Shapes == nil {
					canvas.Snapshot.Shapes = make([]*Shape, 0)
				}
				canvas.Snapshot.Shapes = append(canvas.Snapshot.Shapes, &s)
				canvas.EventLog = append(canvas.EventLog, &Event{
					UserId:    c.user.Id,
					Timestamp: time.Now().Unix(),
					Type:      CreatRect,
					Value:     data, // because shape id is assigned here
				})
				mu.Unlock()

				msg = Message{
					Type: RectCreate,
					Data: data,
				}
				message, _ = json.Marshal(msg)
			}
		case RectPatch:
			{
				var p RectPatchMessage
				json.Unmarshal(msg.Data, &p)

				mu.Lock()
				for _, canv := range canvases {
					if canv.Id == c.user.CurrentCanvasId {
						for _, s := range canv.Snapshot.Shapes {
							if s.Id == p.ShapeId {
								s.Size = p.Size
								break
							}
						}
						break
					}
				}
				mu.Unlock()

				data, _ := json.Marshal(p)
				msg = Message{
					Type: RectPatch,
					Data: data,
				}
				message, _ = json.Marshal(msg)
			}
		case RectUpdate:
			{
				var p RectPatchMessage
				json.Unmarshal(msg.Data, &p)

				mu.Lock()
				var cnv *Canvas
				for _, canv := range canvases {
					if canv.Id == c.user.CurrentCanvasId {
						for _, s := range canv.Snapshot.Shapes {
							if s.Id == p.ShapeId {
								cnv = canv
								s.Size = p.Size
								break
							}
						}
						break
					}
				}
				cnv.EventLog = append(cnv.EventLog, &Event{
					UserId:    c.user.Id,
					Timestamp: time.Now().Unix(),
					Type:      UpdateRect,
					Value:     msg.Data,
				})
				mu.Unlock()

				data, _ := json.Marshal(p)
				msg = Message{
					Type: RectPatch,
					Data: data,
				}
				message, _ = json.Marshal(msg)
			}
		case CircleCreate:
			{
				var s Shape
				json.Unmarshal(msg.Data, &s)
				s.Id = uuid.Must(uuid.NewV4()).String()
				var canvas *Canvas

				mu.Lock()
				for _, cnv := range canvases {
					if cnv.Id == c.user.CurrentCanvasId {
						canvas = cnv
					}
				}
				if canvas == nil {
					// TODO: handle nil canvas
				}
				if canvas.Snapshot == nil {
					canvas.Snapshot = &CanvasData{}
				}
				if canvas.Snapshot.Shapes == nil {
					canvas.Snapshot.Shapes = make([]*Shape, 0)
				}
				canvas.Snapshot.Shapes = append(canvas.Snapshot.Shapes, &s)
				canvas.EventLog = append(canvas.EventLog, &Event{
					UserId:    c.user.Id,
					Timestamp: time.Now().Unix(),
					Type:      CreateCircle,
					Value:     msg.Data,
				})
				mu.Unlock()

				data, _ := json.Marshal(s)
				msg = Message{
					Type: CircleCreate,
					Data: data,
				}
				message, _ = json.Marshal(msg)
			}
		case CirclePatch:
			{
				var p CirclePatchMessage
				json.Unmarshal(msg.Data, &p)

				mu.Lock()
				for _, canv := range canvases {
					if canv.Id == c.user.CurrentCanvasId {
						for _, s := range canv.Snapshot.Shapes {
							if s.Id == p.ShapeId {
								s.Radius = p.Radius
								break
							}
						}
						break
					}
				}
				mu.Unlock()

				data, _ := json.Marshal(p)
				msg = Message{
					Type: CirclePatch,
					Data: data,
				}
				message, _ = json.Marshal(msg)
			}
		case CircleUpdate:
			{
				var p CirclePatchMessage
				json.Unmarshal(msg.Data, &p)

				mu.Lock()
				var cnv *Canvas
				for _, canv := range canvases {
					if canv.Id == c.user.CurrentCanvasId {
						for _, s := range canv.Snapshot.Shapes {
							if s.Id == p.ShapeId {
								cnv = canv
								s.Radius = p.Radius
								break
							}
						}
						break
					}
				}

				cnv.EventLog = append(cnv.EventLog, &Event{
					UserId:    c.user.Id,
					Timestamp: time.Now().Unix(),
					Type:      UpdateCircle,
					Value:     msg.Data,
				})
				mu.Unlock()

				data, _ := json.Marshal(p)
				msg = Message{
					Type: CirclePatch,
					Data: data,
				}
				message, _ = json.Marshal(msg)
			}
		}

		c.room.broadcast <- message
	}
}

// writePump pumps messages from the hub to the websocket connection.
//
// A goroutine running writePump is started for each connection. The
// application ensures that there is at most one writer to a connection by
// executing all writes from this goroutine.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := c.conn.WriteMessage(websocket.TextMessage, message)

			if err != nil {
				return
			}
		case <-ticker.C:
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
