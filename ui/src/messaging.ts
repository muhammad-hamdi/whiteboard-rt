export enum MessageType {
    NewCanvas,
    ConnectToCanvas,
    CanvasCreated,
	UserCreated,
    CursorUpdate,

    // Canvas Events
    CreateRectEvent,
    RectPatch,
    RectUpdate
}

export interface Message {
    type: MessageType
    data: any
}