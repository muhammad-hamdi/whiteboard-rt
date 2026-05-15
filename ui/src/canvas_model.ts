export interface Vec2 {
    x: number
    y: number
}

export enum ShapeType {
	Rect,
	Circle,
	Line,
	Path,
}

export interface Shape {
	id       :string
	type     :ShapeType
	position :Vec2
	size     :Vec2
	radius   :number
    filled   :boolean
	points   :Vec2[]
	text     :Text
	color    :string
}

export interface Text {
	id       :string
	size     :number
	position :Vec2
	color    :string
}

export interface BrushStroke {
	id         :string
	line_width :number
	points     :Vec2[]
	color      :string
}

export interface CanvasData {
	shapes        :Shape[]
	text          :Text[]
	brush_strokes :BrushStroke[]
}

export enum EventType {
    CreatRect
}

export interface Event {
    user_id    :string
	timestamp  :number
	type       :EventType
	value      : any
}

export interface Canvas {
	id        :string
	owner_id  :string
	snapshot  :CanvasData
	event_log :Event[]
}

/**
    Example message
    {
        type: MessageType.CanvasEvent,
        data: {
            type: EventType.CreatRect,
            value: {
                type: ShapeType.Rect,
                position: {x:0,y:0},
                size: {x:100,y:50},
                color: 0x00F0FF
            }
        }
    }
 */