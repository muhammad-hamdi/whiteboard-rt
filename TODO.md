# TODO

- [ ] Refactor: front-end canvas code and all tool handling in sparse switch cases with repeated code
- [ ] Refactor: the parsing and data handling in the client readPump
- [ ] Add text... Oh boy
- [ ] Better brush rendering with line width variation
- [ ] Explore unifying BrushStroke and Shape structs for simpler inserts and sorting for rendering
- [ ] Zooming functionality
- [ ] Fix: disconnection and not handling heartbeats and reconnection attempts
- [ ] UI: add ui for using tools and adjusting tool options
- [ ] UI: add ui for creating new canvas and showing old canvases and connecting to them
- [ ] DB: add db schemas and db connections and have persistent data
- [ ] Handle other types of updates for shapes like fill, color, and (text).
- [ ] System: local first data with syncing when connection establish, as of now if no connection the board is broken
- [ ] Auth: lazy authentication with user data saved locally first with no db until they login to persist it