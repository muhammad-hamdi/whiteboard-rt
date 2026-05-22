// Copyright 2013 The Gorilla WebSocket Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package main

import (
	"encoding/json"
)

// the room models the hub for connected clients
type Room struct {
	CanvasId string

	// Registered clients.
	clients map[*Client]bool

	// Inbound messages from the clients.
	broadcast chan []byte

	// Register requests from the clients.
	register chan *Client

	// Unregister requests from clients.
	unregister chan *Client
}

func newRoom(CanvasId string) *Room {
	return &Room{
		CanvasId:   CanvasId,
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
	}
}

func (r *Room) run() {
	for {
		select {
		case client := <-r.register:
			r.clients[client] = true
		case client := <-r.unregister:
			if _, ok := r.clients[client]; ok {
				delete(r.clients, client)
				close(client.send)
			}
		case message := <-r.broadcast:
			{
				var msg Message
				json.Unmarshal(message, &msg)

				for client := range r.clients {
					if !msg.RebroadcastToSender && client.user.Id == msg.SenderId {
						continue
					}
					select {
					case client.send <- message:
					default:
						close(client.send)
						delete(r.clients, client)
					}
				}
			}
		}
	}
}
