export enum MessageType {
    NewCanvas,
    ConnectToCanvas,
    CanvasCreated,
	UserCreated,
    CursorUpdate,

    // Canvas Events
    RectCreate,
    RectPatch,
    RectUpdate,

    CircleCreate,
	CirclePatch,
	CircleUpdate,

	LineCreate,
	LinePatch,
	LineUpdate,

	PathCreate,
	PathPatch,
	PathUpdate,

	BrushCreate,
	BrushPatch,
	BrushUpdate,
}

export interface Message {
    type: MessageType
    data: any
}