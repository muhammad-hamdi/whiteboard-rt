package main

type Vec2 struct {
	X float32 `json:"x"`
	Y float32 `json:"y"`
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
	Id       string    `json:"id"`
	Type     ShapeType `json:"type"`
	Position Vec2      `json:"position"`
	Size     Vec2      `json:"size"`
	Radius   float32   `json:"radius"`
	Filled   bool      `json:"filled"`
	Points   []Vec2    `json:"points"`
	Text     Text      `json:"text"`
	Color    string    `json:"color"`
}

type Text struct {
	Id       string `json:"id"`
	Size     int    `json:"size"`
	Position Vec2   `json:"position"`
	Color    string `json:"color"`
}

type BrushStroke struct {
	Id        string  `json:"id"`
	LineWidth float32 `json:"line_width"`
	Points    []Vec2  `json:"points"`
	Color     string  `json:"color"`
}

type CanvasData struct {
	Shapes       []*Shape       `json:"shapes"`
	Text         []*Text        `json:"text"`
	BrushStrokes []*BrushStroke `json:"brush_stroke"`
}

type EventType int

const (
	CreatRect EventType = iota
	UpdateRect
	CreateCircle
	UpdateCircle
)

type Event struct {
	UserId    string    `json:"user_id"`
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

var (
	users       []*User   // users table
	canvases    []*Canvas // canvases table
	socketRooms []*Room
)
