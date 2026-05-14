package main

import "github.com/gorilla/websocket"

type Vec2 struct {
	X float32 `json:"x"`
	Y float32 `json:"y"`
}

type RoomData struct {
	Id           string `json:"id"`
	CameraTarget Vec2   `json:"cameraTarget"`
}

type User struct {
	Id              string `json:"id"`
	CurrentCanvasId string `json:"current_room_id"`
	Present         bool   `json:"present"`
	CursorPosition  Vec2   `json:"cursor_pos"`
}

type ShapeType int

const (
	Rect ShapeType = iota
	Circle
	Line
	Path
)

type Shape struct {
	Id       string
	Type     ShapeType
	Position Vec2
	Size     Vec2
	Radius   float32
	Points   []Vec2
	Text     Text
	Color    uint
}

type Text struct {
	Id       string
	Size     int
	Position Vec2
	Color    uint
}

type BrushStroke struct {
	Id        string
	LineWidth float32
	Points    []Vec2
	uint
}

type CanvasData struct {
	Shapes       []Shape
	Text         []Text
	BrushStrokes []BrushStroke
}

type EventType int

const (
	CreatRect EventType = iota
)

type Event struct {
	Timestamp int64     `json:"timestamp"`
	Type      EventType `json:"type"`
	Value     []byte    `json:"value"`
}

type Canvas struct {
	Id       string      `json:"id"`
	OwnerId  string      `json:"owner_id"`
	Snapshot *CanvasData `json:"snapshot"`
	EventLog []*Event    `json:"event_log"`
}

// the room models the hub for connected clients
type Room struct {
	CanvasId  string
	Clients   map[*websocket.Conn]User
	Broadcast chan []byte
}

type MessageType int

const (
	NewCanvas MessageType = iota
	ConnectToCanvas
	CursorUpdate
)

type Message struct {
	Type MessageType `json:"type"`
	Data []byte      `json:"data"`
}

type NewCanvasMessage struct {
	UserId string `json:"user_id"`
}

type ConnectToCanvasMessage struct {
	UserId   string `json:"user_id"`
	CanvasId string `json:"canvas_id"`
}

var (
	users       []*User   // users table
	canvases    []*Canvas // canvases table
	socketRooms []*Room
)
