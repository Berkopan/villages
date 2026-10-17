# Villages integration contract

Runtime: dependency-free ES modules, Canvas 2D, static relative URLs. Root owns main.js, persistence, integration, tests, documentation and repository. Simulation agent owns src/sim/*, visual agent owns src/render/*, interface agent owns index.html and src/ui/*. Do not commit independently.

## Simulation API (src/sim/engine.js)

- `createWorld(options = {})`: serializable world; seed string, width 88, height 64, population 96, climate balanced/dry/lush, aggression 1, maxPopulation 500. No DOM dependency.
- `stepWorld(world, dt = 0.1)`: advances the world by simulated days; fixed caller dt, deterministic. Root uses 10 fixed updates per real second at 1x.
- `getStats(world)`: numeric world summary (population, settlements, food, wood, stone, births, deaths, wars, avgAge, avgLevel, happiness).
- `applyIntervention(world, type, x, y, options = {})`: inspect has no mutation; supported actual interventions rain, food, trees, settlers, fire.
- `restoreWorld(data)`: restores a validated JSON world and any engine caches. Root performs envelope/version/security validation before this. Can simply return data when caches are lazy.
- `getTile(world, x, y)`: safe tile lookup.

World: `{version,seed,width,height,tick,day,year,season,weather,agents,tiles,buildings,farms,settlements,events,history,effects,...engine state}`. Arrays, plain objects, primitive values only (no functions/Maps/Sets in serialized state).

Tiles: flattened row-major `tiles[y * width + x]`. `{x,y,biome,elevation,moisture,fertility,trees,food,stone,ore,fish,road,fire,...}`. Biomes: `deepwater`, `water`, `sand`, `grass`, `forest`, `hill`, `mountain`, `snow`. Water and high mountains are nonwalkable. Numeric resources >=0. Define/share exact interpretation of tree quantities.

Agents: `{id,name,sex,age,lifeStage,x,y,vx,vy,direction,appearance:{skin,hair,hairStyle,outfit,accent,...},role,level,xp,skills,action:{type,targetX,targetY,progress,...},health,hunger,energy,morale,traits,inventory,settlementId,homeId,parents,partnerId,childrenIds,...}`. Age in years; health/energy/morale 0..100, hunger 0 full..100 starving. Life stages baby/child/teen/adult/elder. Positions in tile units. Dead removed from agents; bounded grave/memorial records separately if desired. Roles: gatherer, farmer, lumberjack, miner, fisher, hunter, builder, smith, healer, trader, warrior, scholar. Standard action types: idle, walk, gather, farm, chop, mine, fish, hunt, build, craft, heal, trade, fight, flee, migrate, eat, rest, socialize, study. Direction 0..3 or string; renderer must normalize. Boolean alive optional.

Buildings: `{id,type,x,y,level,progress,settlementId,...}` (progress 0..1). Types: campfire, hut, house, granary, well, lumberyard, mine, workshop, market, barracks, watchtower, hall, shrine. Farms separate: `{id,x,y,growth,water,ripe,settlementId,...}`.

Settlements: `{id,name,color,x,y,stage,population,stockpile,knowledge,prosperity,relations,...}`. Stockpile resource keys: food, wood, stone, ore, tools, medicine. Stage: camp, hamlet, village, town, city. Relations object keyed by settlement id; document exact relation shape. Civilization growth from conditions, not elapsed dates.

Events: `{id,day,type,title,description,x,y,agentId,settlementId,...}`. Type info/birth/death/founding/growth/migration/trade/war/peace/discovery/fire; bounded recent chronicle. Titles/descriptions Turkish initially. History samples `{day,population,food,births,deaths,wars,...}`.

## Renderer API (src/render/renderer.js)

Export class `WorldRenderer` constructed with `(canvas, {onSelect, onHover, onPaint, onCameraChange} = {})`.
- `setWorld(world)` when replacing world.
- `render(world, {time,alpha,selected,overlay,tool,follow,paused,...} = {})` every animation frame. time is seconds, alpha interpolation fraction; selected is `{type:'agent'|'settlement'|'building'|'tile',id?,x?,y?}` or null; overlay default `natural`, others `territory`, `fertility`, `resources`, `danger`.
- `resize()` reads canvas parent dimensions/device scale. ResizeObserver preferred.
- `focus(x,y,zoom?)`, `zoomBy(factor)`, `fitWorld()`, `destroy()`.
- `drawMinimap(canvas, world, selected?)` method or equivalent export.
- `drawPortrait(ctx, agent, size=64)` export in sprites.js or renderer.js (communicate location).
Camera/pan/zoom/pointer selection belongs renderer. Screen coordinates convert to tile coordinates before callbacks. `onSelect(selection)`, `onHover({x,y,...}|null)`, `onPaint({type,x,y})` uses current render tool; tools include inspect/rain/food/trees/settlers/fire. `onCameraChange(camera)` optional. Right click or drag pans, click selects; wheel zoom; pinch on touch. Do not draw pixel art using emoji.

## UI API (src/ui/ui.js)

Export `createUI({getSnapshot, actions})` returns `{update(snapshot?),toast(message,type?),destroy()}`. index.html loads `./src/main.js` and CSS `./src/ui/style.css`, exposes `#world-canvas` and `#minimap` canvas.
Snapshot `{world,stats,speed,paused,selected,overlay,tool,follow,fps,saving,lastSaved,...}`.
Actions `{setSpeed,togglePause,step,setOverlay,setTool,select,focus,follow,newWorld,save,load,exportSave,importSave,zoomIn,zoomOut,fitWorld,toggleSound}`. `newWorld(options)` options follow engine contract; importSave receives File; focus receives selection or `{x,y}`; follow takes boolean. Save/load localStorage; export/import JSON.
UI should not read/step engine directly. Root updates ~4 times/sec. Display real values, derived labels can map string codes. Every control accessible and functional; responsive drawer; dialogs keyboard accessible. Character portrait uses actual same sprite renderer, drawn by UI.

## Coordination

Tell other agents of schema additions and concrete naming deviations before integration. Strong defaults and fallbacks allow incremental implementation. Record mechanics in source comments; add focused invariant tests with Node built-in test runner where substantive behavior needs verification.
