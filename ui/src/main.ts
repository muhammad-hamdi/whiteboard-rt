import { type Message, MessageType } from "./messaging.js"
import { type Shape, type Canvas, type Vec2, ShapeType, type BrushStroke } from "./canvas_model.js"

enum Tool {
    Rect,
    Circle,
    Line, // two points
    Path, // multiple points, can even add fancy stuff like Bezier-curves
    Brush,
    Select,
    Drag
}

let drawingState = {
    currentTool: Tool.Brush,
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

const wsUri = location.protocol === "https:" ? `wss://${location.host}/websocket` : `ws://${location.host}/websocket`
let websocket = new WebSocket(wsUri)

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

let toolIdMap: Record<Tool, string> = {
    [Tool.Select]: "select",
    [Tool.Drag]: "drag",
    [Tool.Brush]: "brush",
    [Tool.Rect]: "rect",
    [Tool.Circle]: "circle",
    [Tool.Line]: "line",
    [Tool.Path]: "path"
}

function setTool(tool: Tool) {
    drawingState.currentTool = tool
    document.querySelectorAll(".tool").forEach(el => el.classList.remove("active"))
    document.getElementById(toolIdMap[tool])!.classList.add("active")
}

document.querySelectorAll(".tool").forEach(el => {
    el.addEventListener("click", (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        switch (el.id) {
            case "select":
                setTool(Tool.Select)
                break;
            case "drag":
                setTool(Tool.Drag)
                break;
            case "brush":
                setTool(Tool.Brush)
                break;
            case "rect":
                setTool(Tool.Rect)
                break;
            case "circle":
                setTool(Tool.Circle)
                break;
            case "line":
                setTool(Tool.Line)
                break;
            case "path":
                setTool(Tool.Path)
                break;
            default:
                break;
        }
    })
})

const randColor = () => {
        let r: number, g: number, b: number
    do {
        r = Math.floor(Math.random() * 256)
        g = Math.floor(Math.random() * 256)
        b = Math.floor(Math.random() * 256)
    } while (r > 200 && g > 200 && b > 200)  
    return ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")
}

function drawRectangle(s: Shape) {
    // ctx.fillStyle = s.color
    // ctx.fillRect(
    //     s.position.x - pageState.cameraTarget.x,
    //     s.position.y-pageState.cameraTarget.y,
    //     s.size.x,
    //     s.size.y
    // )

    ctx.strokeStyle = s.color
    ctx.lineWidth = 5
    ctx.strokeRect(
        s.position.x - pageState.cameraTarget.x,
        s.position.y-pageState.cameraTarget.y,
        s.size.x,
        s.size.y
    )
    ctx.lineWidth = 1
}

function drawCircle(s: Shape) {
    ctx.beginPath()
    // ctx.fillStyle = s.color as string
    // ctx.moveTo(this.position.x - cameraTarget.x, this.position.y-cameraTarget.y)
    ctx.arc(s.position.x - pageState.cameraTarget.x, s.position.y-pageState.cameraTarget.y, s.radius as number, 0, 2*Math.PI, true)
    // ctx.fill()
    ctx.strokeStyle = s.color
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.lineWidth = 1
}

function drawLine(s: Shape) {
    ctx.beginPath()
    ctx.moveTo(
        s.points[0]!.x - pageState.cameraTarget.x,
        s.points[0]!.y - pageState.cameraTarget.y
    )
    ctx.lineTo(
        s.points[1]!.x - pageState.cameraTarget.x,
        s.points[1]!.y - pageState.cameraTarget.y
    )

    ctx.strokeStyle = s.color
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.lineWidth = 1
}

function drawPath(s: Shape) {
    ctx.beginPath()

    ctx.fillStyle = s.color
    ctx.moveTo(
        s.points[0]!.x - pageState.cameraTarget.x,
        s.points[0]!.y - pageState.cameraTarget.y
    )
    for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(
            s.points[i]!.x - pageState.cameraTarget.x,
            s.points[i]!.y - pageState.cameraTarget.y
        )
    }

    ctx.lineCap = ctx.lineJoin = "round"
    ctx.strokeStyle = s.color
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.lineWidth = 1
    ctx.lineCap = "square"
    ctx.lineJoin = "miter"
}

function drawBrush(b: BrushStroke) {
    ctx.beginPath()

    ctx.lineWidth = b.line_width
    ctx.lineCap = ctx.lineJoin = "round"
    ctx.moveTo(
        b.points[0]!.x - pageState.cameraTarget.x,
        b.points[0]!.y - pageState.cameraTarget.y
    )

    for (let i = 0; i < b.points.length; i++) {
        ctx.lineTo(
            b.points[i]!.x - pageState.cameraTarget.x,
            b.points[i]!.y - pageState.cameraTarget.y
        )
    }

    ctx.stroke()
    ctx.lineWidth = 1
    ctx.lineCap = "square"
    ctx.lineJoin = "miter"
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
                document.getElementById("room")!.innerText = `room id: ${wbCanvas.id}`
                break;
            case MessageType.UserCreated:
                localStorage.setItem("user", JSON.stringify(v.data.user))
                localStorage.setItem("user_id", v.data.user.id)
                break;
            case MessageType.CursorUpdate:
                if(v.data.user_id != localStorage.getItem("user_id")) {
                    if(v.data.disconnected) {
                        cursors.delete(v.data.user_id)
                        document.getElementById("peers")!.innerText = `# of peers: ${cursors.size}`
                        break
                    }
                    let old = cursors.get(v.data.user_id)
                    if(old == undefined) {
                        old = {p: v.data.cursor_pos, c: "#" + randColor()}
                        document.getElementById("peers")!.innerText = `# of peers: ${cursors.size+1}`
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
                break;
            case MessageType.RectPatch:
                {
                    let shape = wbCanvas.snapshot.shapes.find(s => s.id == v.data.shape_id)
                    if(shape) {
                        shape.size = v.data.size
                    }
                }
                break;
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
                break;
            case MessageType.CirclePatch:
                {
                    let shape = wbCanvas.snapshot.shapes.find(s => s.id == v.data.shape_id)
                    if(shape) {
                        shape.radius = v.data.radius
                    }
                }
                break;
            case MessageType.LineCreate:
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
                break;
            case MessageType.LinePatch:
                {
                    let shape = wbCanvas.snapshot.shapes.find(s => s.id == v.data.shape_id)
                    if(shape) {
                        shape.points[1] = v.data.point
                    }
                }
                break;
            case MessageType.PathCreate:
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
                break;
            case MessageType.PathPatch:
                {
                    let shape = wbCanvas.snapshot.shapes.find(s => s.id == v.data.shape_id)
                    if(shape) {
                        shape.points[shape.points.length-1] = v.data.point
                    }
                }
                break;
            case MessageType.PathUpdate:
                {
                    let shape = wbCanvas.snapshot.shapes.find(s => s.id == v.data.shape_id)
                    if(shape) {
                        shape.points.push(v.data.point)
                    }
                }
                break;
            case MessageType.BrushCreate:
                {
                    let lastBrush = wbCanvas.snapshot.brush_strokes[wbCanvas.snapshot.brush_strokes.length-1];
                    if(lastBrush) {
                        if(lastBrush.id) {
                            wbCanvas.snapshot.brush_strokes.push(v.data)
                        } else {
                            lastBrush.id = v.data.id
                            drawingState.currentConstruct.id = v.data.id
                        }
                    } else {
                        wbCanvas.snapshot.brush_strokes.push(v.data)
                    }
                }
                break;
            case MessageType.BrushPatch:
                {
                    let brush = wbCanvas.snapshot.brush_strokes.find(s => s.id == v.data.brush_id)
                    if(brush) {
                        brush.points.push(v.data.point)
                    }
                }
                break;
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

    if(pageState.mouseDown && (drawingState.currentTool == Tool.Drag || keys["ControlLeft"])) {
        pageState.cameraTarget.x -= mouseDelta.x
        pageState.cameraTarget.y -= mouseDelta.y
    }

    // DRAW
    ctx.fillStyle = `#ffffff`
    ctx.fillRect(0,0,canvas.width, canvas.height)

    for(let sh of wbCanvas.snapshot.shapes) {
        switch (sh.type) {
            case ShapeType.Rect:
                drawRectangle(sh);
                break;
            case ShapeType.Circle:
                drawCircle(sh)
                break;
            case ShapeType.Line:
                drawLine(sh);
                break;
            case ShapeType.Path:
                drawPath(sh);
                break;
            default:
                break;
        }
    }

    for(let b of wbCanvas.snapshot.brush_strokes) {
        drawBrush(b)
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

websocket.addEventListener("close", (ev) => reconnectWebsocket)

const reconnectWebsocket = () => {
    websocket = new WebSocket(wsUri)
    websocket.addEventListener("open", (ev) => {
        console.log("Socket Reconnected");
        sendMessage(
            MessageType.ConnectToCanvas, {
                user_id: localStorage.getItem("user_id") ?? "",
                canvas_id: wbCanvas.id
            }
        )
    })
    websocket.addEventListener("message", handleWebsocketMessages)
    websocket.addEventListener("close", (ev) => reconnectWebsocket)
}

setInterval(() => {
    if(websocket.readyState != WebSocket.OPEN) {
        reconnectWebsocket()
    }
}, 1000);

window.addEventListener("keydown", (ev) => {
    keys[ev.code] = true

    if(keys["Digit1"]) {
        setTool(Tool.Brush)
    }
    if(keys["Digit2"]) {
        setTool(Tool.Rect)
    }
    if(keys["Digit3"]) {
        setTool(Tool.Circle)
    }
    if(keys["Digit4"]) {
        setTool(Tool.Line)
    }
    if(keys["Digit5"]) {
        setTool(Tool.Path)
    }

    if(keys["Escape"]) {
        let s = drawingState.currentConstruct
        if(s.id) {
            let shape = wbCanvas.snapshot.shapes.find(sh => sh.id == s.id)
            if(shape) {
                shape.points[shape.points.length-1] = {...shape.points[shape.points.length-2]!}
                sendMessage(
                    MessageType.PathPatch,
                    {
                        shape_id: s.id,
                        point: shape.points[shape.points.length-1]
                    }
                )
            }
            drawingState.currentConstruct = {}
        }
    }

    if(keys["KeyD"]) {
        console.log(wbCanvas);
    }

    if(keys["KeyC"]) {
        navigator.clipboard.writeText(location.href).then(() => {
            document.getElementById("alert")!.innerText = "URL Copied!"
            setTimeout(() => {
                document.getElementById("alert")!.innerText = ""
            }, 1000);
        })
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

function throttle(callback: any, wait: number) {
  let timeout: any
  return function(e: any) {
    if (timeout) return;
    timeout = setTimeout(() => {
      callback(e);
      timeout = undefined;
    }, wait)
  }
}

canvas.addEventListener("mousemove", throttle(() => {
    if(websocket.readyState == WebSocket.OPEN) {
        sendMessage(
            MessageType.CursorUpdate,
            {
                user_id: localStorage.getItem("user_id"),
                cursor_pos: pageState.mouseTarget
            }
        )
    }
}, 100))

canvas.addEventListener("mousemove", throttle((ev: MouseEvent) => {
    pageState.mouseTarget.x = ev.clientX
    pageState.mouseTarget.y = ev.clientY

    if(websocket.readyState == WebSocket.OPEN) {

        if(drawingState.currentConstruct.id) {
            if(drawingState.mouseDown) {
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
                    case Tool.Line:
                        {
                            let s = drawingState.currentConstruct as Shape
                            let shape = wbCanvas.snapshot.shapes.find(sh => sh.id == s.id)
                            if(shape) {
                                shape.points[1] = {
                                    x: (ev.clientX + pageState.cameraTarget.x),
                                    y: (ev.clientY + pageState.cameraTarget.y)
                                }
                            }
                            sendMessage(
                                MessageType.LinePatch,
                                {
                                    shape_id: s.id,
                                    point: {
                                        x: (ev.clientX + pageState.cameraTarget.x),
                                        y: (ev.clientY + pageState.cameraTarget.y)
                                    }
                                }
                            )
                        }
                        break;
                    case Tool.Brush:
                        {
                            let s = drawingState.currentConstruct as BrushStroke
                            let brush = wbCanvas.snapshot.brush_strokes.find(sh => sh.id == s.id)
                            if(brush) {
                                brush.points.push({
                                    x: (ev.clientX + pageState.cameraTarget.x),
                                    y: (ev.clientY + pageState.cameraTarget.y)
                                })
                            }
                            sendMessage(
                                MessageType.BrushPatch,
                                {
                                    brush_id: s.id,
                                    point: {
                                        x: (ev.clientX + pageState.cameraTarget.x),
                                        y: (ev.clientY + pageState.cameraTarget.y)
                                    }
                                }
                            )
                        }
                        break;
                    default:
                        break;
                }
            }
            if(drawingState.currentTool == Tool.Path) {
                let s = drawingState.currentConstruct as Shape
                let shape = wbCanvas.snapshot.shapes.find(sh => sh.id == s.id)
                if(shape) {
                    shape.points[shape.points.length-1] = {
                        x: (ev.clientX + pageState.cameraTarget.x),
                        y: (ev.clientY + pageState.cameraTarget.y)
                    }
                }
                sendMessage(
                    MessageType.PathPatch,
                    {
                        shape_id: s.id,
                        point: {
                            x: (ev.clientX + pageState.cameraTarget.x),
                            y: (ev.clientY + pageState.cameraTarget.y)
                        }
                    }
                )
            }
        }
    }
}, 20))

canvas.addEventListener("mousedown", (ev) => {
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
                    color    :"#1e1e1e",
                }
                wbCanvas.snapshot.shapes.push(drawingState.currentConstruct as Shape)
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
                    color    :"#1e1e1e",
                }
                wbCanvas.snapshot.shapes.push(drawingState.currentConstruct as Shape)
                sendMessage(
                    MessageType.CircleCreate,
                    drawingState.currentConstruct
                )
            }
            break;
        case Tool.Line:
            {
                let p1 = {
                    x: pageState.mouseTarget.x + pageState.cameraTarget.x,
                    y: pageState.mouseTarget.y + pageState.cameraTarget.y,
                }
                let p2 = {...p1}
                drawingState.currentConstruct = {
                    type     :ShapeType.Line,
                    position :{},
                    size     :{x:0,y:0},
                    radius   :0,
                    filled   :false,
                    points   :[p1, p2],
                    text     :{},
                    color    :"#1e1e1e",
                }
                wbCanvas.snapshot.shapes.push(drawingState.currentConstruct as Shape)
                sendMessage(
                    MessageType.LineCreate,
                    drawingState.currentConstruct
                )
            }
            break;
        case Tool.Path: // this is a bit different
            {
                let s = drawingState.currentConstruct
                if(s.id) {
                    let shape = wbCanvas.snapshot.shapes.find(sh => sh.id == s.id)
                    if(shape) {
                        shape.points.push({
                                x: (ev.clientX + pageState.cameraTarget.x),
                                y: (ev.clientY + pageState.cameraTarget.y)
                            })
                        }
                        sendMessage(
                            MessageType.PathUpdate,
                            {
                                shape_id: s.id,
                                point: {
                                    x: (ev.clientX + pageState.cameraTarget.x),
                                    y: (ev.clientY + pageState.cameraTarget.y)
                                }
                            }
                        )
                } else {
                    let p1 = {
                        x: pageState.mouseTarget.x + pageState.cameraTarget.x,
                        y: pageState.mouseTarget.y + pageState.cameraTarget.y,
                    }
                    let p2 = {...p1}
                    drawingState.currentConstruct = {
                        type     :ShapeType.Path,
                        position :{},
                        size     :{x:0,y:0},
                        radius   :0,
                        filled   :false,
                        points   :[p1, p2],
                        text     :{},
                        color    :"#1e1e1e",
                    }
                    wbCanvas.snapshot.shapes.push(drawingState.currentConstruct as Shape)
                    sendMessage(
                        MessageType.PathCreate,
                        drawingState.currentConstruct
                    )
                }
            }
            break;
        case Tool.Brush:
            {
                let p1 = {
                    x: pageState.mouseTarget.x + pageState.cameraTarget.x,
                    y: pageState.mouseTarget.y + pageState.cameraTarget.y,
                }
                drawingState.currentConstruct = {
                    line_width: 5,
                    points   :[p1],
                    color    :"#1e1e1e",
                }
                wbCanvas.snapshot.brush_strokes.push(drawingState.currentConstruct as BrushStroke)
                sendMessage(
                    MessageType.BrushCreate,
                    drawingState.currentConstruct
                )
            }
            break;
        default:
            break;
    }
})

canvas.addEventListener("mouseup", (ev: MouseEvent) => {
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
                        drawingState.currentConstruct = {}
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
                        drawingState.currentConstruct = {}
                    }
                    break;
                case Tool.Line:
                    {
                        let s = drawingState.currentConstruct as Shape
                        let shape = wbCanvas.snapshot.shapes.find(sh => sh.id == s.id)
                        if(shape) {
                            shape.points[1] = {
                                x: (ev.clientX + pageState.cameraTarget.x),
                                y: (ev.clientY + pageState.cameraTarget.y)
                            }
                        }
                        sendMessage(
                            MessageType.LineUpdate,
                            {
                                shape_id: s.id,
                                point: {
                                    x: (ev.clientX + pageState.cameraTarget.x),
                                    y: (ev.clientY + pageState.cameraTarget.y)
                                }
                            }
                        )
                        drawingState.currentConstruct = {};
                    }
                    break;
                case Tool.Brush:
                    {
                        let s = drawingState.currentConstruct as BrushStroke
                        let brush = wbCanvas.snapshot.brush_strokes.find(sh => sh.id == s.id)
                        if(brush) {
                            brush.points.push({
                                x: (ev.clientX + pageState.cameraTarget.x),
                                y: (ev.clientY + pageState.cameraTarget.y)
                            })
                        }
                        sendMessage(
                            MessageType.BrushUpdate,
                            {
                                brush_id: s.id,
                                point: {
                                    x: (ev.clientX + pageState.cameraTarget.x),
                                    y: (ev.clientY + pageState.cameraTarget.y)
                                }
                            }
                        )
                        drawingState.currentConstruct = {}
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