package main

type MessageType int

const (
	NewCanvas MessageType = iota
	ConnectToCanvas
	CanvasCreated
	UserCreated
	CursorUpdate

	// Canvas Events
	CreateRectEvent
	RectPatch  // consquent size/property changes, not recorded as a whole in the event log
	RectUpdate // the recorded event: accepted "threshold" where user mouse up
)

type Message struct {
	Type MessageType `json:"type"`
	Data any         `json:"data"`
}

type NewCanvasMessage struct {
	UserId string `json:"user_id"`
}

type ConnectToCanvasMessage struct {
	UserId   string `json:"user_id"`
	CanvasId string `json:"canvas_id"`
}

type CanvasCreatedMessage struct {
	Canvas Canvas `json:"canvas"`
}

type UserCreatedMessage struct {
	User User `json:"user"`
}

type CursorUpdateMessage struct {
	UserId         string `json:"user_id"`
	CursorPosition Vec2   `json:"cursor_pos"`
	Disconnected   bool   `json:"disconnected"`
}

type RectPatchMessage struct {
	ShapeId string `json:"shape_id"`
	Size    Vec2   `json:"size"`
}
