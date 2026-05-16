import { type Message, MessageType } from "./messaging.js"
import { type Shape, type Canvas, type Vec2, ShapeType } from "./canvas_model.js"

enum Tool {
    Rect,
    Circle,
    Line,
    Brush
}

let drawingState = {
    currentTool: Tool.Rect,
    mouseDown: false,
    currentConstruct: {} as any
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement
canvas.width = window.innerWidth
canvas.height = window.innerHeight
window.addEventListener("resize", () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
})

const ctx = canvas.getContext("2d") as CanvasRenderingContext2D

if (!ctx) {
  throw new Error("Could not get 2d context from canvas");
}

const wsUri = "ws://localhost:3000/websocket"
const websocket = new WebSocket(wsUri)

let keys: Record<string, boolean> = {}

let pageState = {
    cameraTarget: {x:0,y:0},
    mouseCurrent: {x:0,y:0},
    mouseTarget : {x:0,y:0},
    mouseEase   : 0.1,
    mouseDown   : false,
    zoomLevel   : 1.0 //TODO: zooming, attempted it, seems like a big headache in the canvas 2d api, will try again later
}

let wbCanvas: Canvas = {
    id: "",
    owner_id: "",
    snapshot: {
        shapes: [],
        text: [],
        brush_strokes: []
    },
    event_log: []
}

let cursors: Map<string, {p:Vec2, c:string}> = new Map()

const randRange = (min: number = 0, max: number = 1) => {
    let r = min/max
    return (Math.random()+r) * max
}

const randColor = () => {
    return Math.floor(randRange(0.5)*0xFF + randRange(0.5)*0xFF00 + randRange(0.5)*0xFF0000).toString(16)
}

function drawRectangle(s: Shape) {
    ctx.fillStyle = s.color
    ctx.fillRect(
        s.position.x - pageState.cameraTarget.x,
        s.position.y-pageState.cameraTarget.y,
        s.size.x,
        s.size.y
    )
}

function drawCircle(s: Shape) {
    ctx.beginPath()
    ctx.fillStyle = s.color as string
    // ctx.moveTo(this.position.x - cameraTarget.x, this.position.y-cameraTarget.y)
    ctx.arc(s.position.x - pageState.cameraTarget.x, s.position.y-pageState.cameraTarget.y, s.radius as number, 0, 2*Math.PI, true)
    ctx.fill()
    ctx.stroke()
}

const sendMessage = (type: MessageType, data: any) => {
    websocket.send(JSON.stringify(
        {
            type,
            data
        }
    ))
}

const handleWebsocketMessages = (ev: MessageEvent) => {
    try {
        let v = JSON.parse(ev.data)
        switch (v.type) {
            case MessageType.CanvasCreated:
                wbCanvas = v.data.canvas
                history.pushState({}, "", wbCanvas.id)
                break;
            case MessageType.UserCreated:
                localStorage.setItem("user", JSON.stringify(v.data.user))
                localStorage.setItem("user_id", v.data.user.id)
                break;
            case MessageType.CursorUpdate:
                if(v.data.user_id != localStorage.getItem("user_id")) {
                    if(v.data.disconnected) {
                        cursors.delete(v.data.user_id)
                        break
                    }
                    let old = cursors.get(v.data.user_id)
                    if(old == undefined) {
                        // TODO: make sure color isn't too bright for white text on top
                        old = {p: v.data.cursor_pos, c: "#" + randColor()}
                    }
                    old.p = v.data.cursor_pos
                    cursors.set(v.data.user_id, old)
                }
                break;
            case MessageType.RectCreate:
                {
                    let lastShape = wbCanvas.snapshot.shapes[wbCanvas.snapshot.shapes.length-1];
                    if(lastShape) {
                        if(lastShape.id) {
                            wbCanvas.snapshot.shapes.push(v.data)
                        } else {
                            lastShape.id = v.data.id
                            drawingState.currentConstruct.id = v.data.id
                        }
                    } else {
                        wbCanvas.snapshot.shapes.push(v.data)
                    }
                }
            case MessageType.RectPatch:
                {
                    let shape = wbCanvas.snapshot.shapes.find(s => s.id == v.data.shape_id)
                    if(shape) {
                        shape.size = v.data.size
                    }
                    console.log(v.data);
                }
            case MessageType.CircleCreate:
                {
                    let lastShape = wbCanvas.snapshot.shapes[wbCanvas.snapshot.shapes.length-1];
                    if(lastShape) {
                        if(lastShape.id) {
                            wbCanvas.snapshot.shapes.push(v.data)
                        } else {
                            lastShape.id = v.data.id
                            drawingState.currentConstruct.id = v.data.id
                        }
                    } else {
                        wbCanvas.snapshot.shapes.push(v.data)
                    }
                }
            case MessageType.CirclePatch:
                {
                    let shape = wbCanvas.snapshot.shapes.find(s => s.id == v.data.shape_id)
                    if(shape) {
                        shape.radius = v.data.radius
                    }
                }
            default:
                break;
        }
    } catch(err) {
        console.log(err);
    }
}

if(location.pathname.slice(1).split("/")[0]?.length == 36) {
    // Init message ConnectToCanvas
    wbCanvas.id = location.pathname.slice(1).split("/")[0] as string

    websocket.addEventListener("open", (ev) => {
        console.log("Socket Connected");
        // init message
        sendMessage(
            MessageType.ConnectToCanvas, {
                user_id: localStorage.getItem("user_id") ?? "",
                canvas_id: wbCanvas.id
            }
        )
    })

    websocket.addEventListener("message", handleWebsocketMessages)
} else {
    websocket.addEventListener("open", (ev) => {
        console.log("Socket Connected");
        // init message
        sendMessage(
            MessageType.NewCanvas,
            {
                user_id: localStorage.getItem("user_id") ?? ""
            }
        )
    })

    websocket.addEventListener("message", handleWebsocketMessages)
}

const update = (time: DOMHighResTimeStamp) => {
    // UPDATE
    let mouseDelta = {x: pageState.mouseTarget.x - pageState.mouseCurrent.x, y: pageState.mouseTarget.y - pageState.mouseCurrent.y}

    pageState.mouseCurrent.x += mouseDelta.x
    pageState.mouseCurrent.y += mouseDelta.y

    if(pageState.mouseDown && keys["ControlLeft"]) {
        pageState.cameraTarget.x -= mouseDelta.x
        pageState.cameraTarget.y -= mouseDelta.y
    }

    // DRAW
    ctx.fillStyle = `#F5F5F5`
    ctx.fillRect(0,0,canvas.width, canvas.height)

    for(let e of wbCanvas.snapshot.shapes) {
        switch (e.type) {
            case ShapeType.Rect:
                drawRectangle(e)
                break;
            case ShapeType.Circle:
                drawCircle(e)
            default:
                break;
        }
    }

    for(const [k,v] of cursors) {
        ctx.fillStyle = v.c
        ctx.beginPath();
        ctx.moveTo(v.p.x, v.p.y);
        ctx.lineTo(v.p.x+12, v.p.y+15);
        ctx.lineTo(v.p.x, v.p.y+20);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(v.p.x+10, v.p.y+15, 240, 16, [40]);
        ctx.fill();
        ctx.fillStyle = "white"
        ctx.font = "12px sans-serif";
        ctx.fillText(k, v.p.x+15, v.p.y+27);
    }

    requestAnimationFrame(update)
}

requestAnimationFrame(update)

window.addEventListener("keydown", (ev) => {
    keys[ev.code] = true

    if(keys["KeyC"]) {
        drawingState.currentTool = Tool.Circle
    }

    if(keys["KeyR"]) {
        drawingState.currentTool = Tool.Rect
    }
})

window.addEventListener("keyup", (ev) => {
    keys[ev.code] = false
})

//#region fix keys stalling as true not being unset, modifier keys specifically (ControlLeft)
window.addEventListener("blur", () => {
    for(const key in keys) {
        keys[key] = false
    }
})

document.addEventListener("visibilitychange", () => {
    if(document.hidden) {
        for(const key in keys) {
            keys[key] = false
        }
    }
})
//#endregion

window.addEventListener("mousemove", (ev) => {
    pageState.mouseTarget.x = ev.clientX
    pageState.mouseTarget.y = ev.clientY

    if(websocket.readyState == WebSocket.OPEN) {
        sendMessage(
            MessageType.CursorUpdate,
            {
                user_id: localStorage.getItem("user_id"),
                cursor_pos: pageState.mouseTarget
            }
        )

        if(drawingState.currentConstruct.id && drawingState.mouseDown) {
            switch (drawingState.currentTool) {
                case Tool.Rect:
                    {
                        let s = drawingState.currentConstruct as Shape
                        let shape = wbCanvas.snapshot.shapes.find(sh => sh.id == s.id)
                        if(shape) {
                            shape.size = {
                                x: (ev.clientX + pageState.cameraTarget.x) - s.position.x,
                                y: (ev.clientY + pageState.cameraTarget.y) - s.position.y
                            }
                        }
                        console.log(s);
                        sendMessage(
                            MessageType.RectPatch,
                            {
                                shape_id: s.id,
                                size: {
                                    x: (ev.clientX + pageState.cameraTarget.x) - s.position.x,
                                    y: (ev.clientY + pageState.cameraTarget.y) - s.position.y
                                }
                            }
                        )
                    }
                    break;
                case Tool.Circle:
                    {
                        let s = drawingState.currentConstruct as Shape
                        let shape = wbCanvas.snapshot.shapes.find(sh => sh.id == s.id)
                        let r = Math.sqrt(
                            Math.pow((ev.clientX + pageState.cameraTarget.x) - s.position.x, 2)
                            + Math.pow((ev.clientY + pageState.cameraTarget.y) - s.position.y, 2)
                        )
                        if(shape) {
                            shape.radius = r
                        }
                        sendMessage(
                            MessageType.CirclePatch,
                            {
                                shape_id: s.id,
                                radius: r
                            }
                        )
                    }
                    break;
                default:
                    break;
            }
        }
    }
})

window.addEventListener("mousedown", () => {
    pageState.mouseDown = true

    if(
        keys["ControlLeft"]  ||
        keys["ControlRight"] ||
        keys["ShiftLeft"]    ||
        keys["ShiftRight"]   ||
        keys["AltLeft"]      ||
        keys["AltRight"]     ||
        keys["MetaLeft"]     ||
        keys["MetaRight"]
    ) {
        return
    }

    drawingState.mouseDown = true
    switch (drawingState.currentTool) {
        case Tool.Rect:
            {
                drawingState.currentConstruct = {
                    type     :ShapeType.Rect,
                    position :{
                        x: pageState.mouseTarget.x + pageState.cameraTarget.x,
                        y: pageState.mouseTarget.y + pageState.cameraTarget.y,
                    },
                    size     :{x:0,y:0},
                    radius   :0,
                    filled   :false,
                    points   :[],
                    text     :{},
                    color    :"#282538",
                }
                wbCanvas.snapshot.shapes.push(drawingState.currentConstruct as Shape)
                console.log(drawingState.currentConstruct);
                sendMessage(
                    MessageType.RectCreate,
                    drawingState.currentConstruct
                )
            }
            break;
        case Tool.Circle:
            {
                drawingState.currentConstruct = {
                    type     :ShapeType.Circle,
                    position :{
                        x: pageState.mouseTarget.x + pageState.cameraTarget.x,
                        y: pageState.mouseTarget.y + pageState.cameraTarget.y,
                    },
                    size     :{x:0,y:0},
                    radius   :0,
                    filled   :false,
                    points   :[],
                    text     :{},
                    color    :"#282538",
                }
                wbCanvas.snapshot.shapes.push(drawingState.currentConstruct as Shape)
                console.log(wbCanvas.snapshot.shapes);
                sendMessage(
                    MessageType.CircleCreate,
                    drawingState.currentConstruct
                )
            }
            break;
        default:
            break;
    }
})

window.addEventListener("mouseup", (ev: MouseEvent) => {
    if(websocket.readyState == WebSocket.OPEN) {
        if(drawingState.currentConstruct.id && drawingState.mouseDown) {
            switch (drawingState.currentTool) {
                case Tool.Rect:
                    {
                        let s = drawingState.currentConstruct as Shape
                        let shape = wbCanvas.snapshot.shapes.find(sh => sh.id == s.id)
                        if(shape) {
                            shape.size = {
                                x: (ev.clientX + pageState.cameraTarget.x) - s.position.x,
                                y: (ev.clientY + pageState.cameraTarget.y) - s.position.y
                            }
                        }
                        sendMessage(
                            MessageType.RectUpdate,
                            {
                                shape_id: s.id,
                                size: {
                                    x: (ev.clientX + pageState.cameraTarget.x) - s.position.x,
                                    y: (ev.clientY + pageState.cameraTarget.y) - s.position.y
                                }
                            }
                        )

                    }
                    break;
                case Tool.Circle:
                    {
                        let s = drawingState.currentConstruct as Shape
                        let shape = wbCanvas.snapshot.shapes.find(sh => sh.id == s.id)
                        let r = Math.sqrt(
                            Math.pow((ev.clientX + pageState.cameraTarget.x) - s.position.x, 2)
                            + Math.pow((ev.clientY + pageState.cameraTarget.y) - s.position.y, 2)
                        )
                        if(shape) {
                            shape.radius = r
                        }
                        sendMessage(
                            MessageType.CircleUpdate,
                            {
                                shape_id: s.id,
                                radius: r
                            }
                        )

                    }
                    break;
                default:
                    break;
            }
        }
    }

    pageState.mouseDown = false
    drawingState.mouseDown = false
})

window.addEventListener('beforeunload', () => {
    // Check if the socket is open before trying to send
    if (websocket.readyState === WebSocket.OPEN) {
        sendMessage(
            MessageType.CursorUpdate,
            {
                user_id: localStorage.getItem("user_id"),
                cursor_pos: {x:null,y:null},
                disconnected: true
            }
        );
        // Optional: Gracefully close the connection manually
        websocket.close();
    }
});