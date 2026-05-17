package main

import "encoding/json"

type MessageType int

const (
	NewCanvas MessageType = iota
	ConnectToCanvas
	CanvasCreated
	UserCreated
	CursorUpdate

	// Canvas Events
	RectCreate
	RectPatch  // consquent size/property changes, not recorded as a whole in the event log
	RectUpdate // the recorded event: accepted "threshold" where user mouse up

	CircleCreate
	CirclePatch
	CircleUpdate

	LineCreate
	LinePatch
	LineUpdate

	PathCreate
	PathPatch
	PathUpdate

	BrushCreate
	BrushPatch
	BrushUpdate
)

type Message struct {
	Type MessageType     `json:"type"`
	Data json.RawMessage `json:"data"`
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

// TODO: should have a more generic struct to handle different properties with rtti
// like rect color, filled, text, etc.
type RectPatchMessage struct {
	ShapeId string `json:"shape_id"`
	Size    Vec2   `json:"size"`
}

type CirclePatchMessage struct {
	ShapeId string  `json:"shape_id"`
	Radius  float32 `json:"radius"`
}
