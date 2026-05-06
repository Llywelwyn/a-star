namespace scene {
    // Costs are scaled by 1000 so we can use integer math for the diagonal cost (~sqrt(2)).
    const ORTHOGONAL_COST = 1000;
    export let DIAGONAL_COST = 1414;

    export enum PathType {
        //% block="8-way"
        EightWay,
        //% block="4-way"
        FourWay,
    }

    class PrioritizedLocation {
        constructor(
            public loc: SimpleLocation,
            public cost: number,
            public totalCost: number // cost + heuristic
        ) { }
    }

    class LocationNode {
        public visited: boolean;

        constructor(
            public l: SimpleLocation,
            public parent: LocationNode,
            public lastCost: number
        ) {
            this.visited = false;
        }
    }

    class SimpleLocation {
        constructor(public col: number, public row: number) { }
    }

    /**
     * Find the shortest path between start and end that does not contain walls and optionally limited to a pathable tile.
     */
    //% block="path from $start to $end using $movement||on tiles of $onTilesOf"
    //% start.shadow=mapgettile
    //% end.shadow=mapgettile
    //% movement.defl=scene.PathType.EightWay
    //% onTilesOf.shadow=tileset_tile_picker
    //% onTilesOf.decompileIndirectFixedInstances=true
    //% help=github:arcade-tilemap-a-star/docs/a-star
    //% group="Path Following" weight=10
    export function aStar(start: tiles.Location, end: tiles.Location, movement: PathType, onTilesOf: Image = null) {
        const tm = game.currentScene().tileMap;
        if (!tm || !start || !end)
            return undefined;

        const startLoc = new SimpleLocation(start.col, start.row);
        const endLoc = new SimpleLocation(end.col, end.row);
        if (!isWalkable(endLoc, onTilesOf, tm))
            return undefined;

        return generalAStar(tm, startLoc, onTilesOf, movement,
            t => tileLocationHeuristic(t, endLoc, movement),
            l => l.col === endLoc.col && l.row === endLoc.row);
    }

    export function aStarToAnyOfType(start: tiles.Location, tile: Image, onTilesOf: Image, movement: PathType = PathType.EightWay) {
        const tm = game.currentScene().tileMap;
        if (!tm || !start)
            return undefined;
        const startLoc = new SimpleLocation(start.col, start.row);
        const endIndex = tm.getImageType(tile);
        const potentialEndPoints = tm.getTilesByType(endIndex);

        if (!potentialEndPoints || potentialEndPoints.length === 0)
            return undefined;

        return generalAStar(tm, startLoc, onTilesOf, movement,
            _ => 0,
            l => endIndex === tm.getTileIndex(l.col, l.row));
    }

    export function generalAStar(tm: tiles.TileMap, start: SimpleLocation, onTilesOf: Image, movement: PathType,
        heuristic: (tile: SimpleLocation) => number,
        isEnd: (tile: SimpleLocation) => boolean): tiles.Location[] {

        if (!isWalkable(start, onTilesOf, tm)) {
            return undefined;
        }

        const consideredTiles: PrioritizedLocation[] = [];
        const encounteredLocations: LocationNode[][] = [[]];

        function updateOrFillLocation(l: SimpleLocation, parent: LocationNode, cost: number) {
            const colData = encounteredLocations[l.col] || (encounteredLocations[l.col] = []);
            const lData = colData[l.row];

            if (!lData) {
                colData[l.row] = new LocationNode(l, parent, cost);
            } else if (lData.lastCost > cost) {
                lData.lastCost = cost;
                lData.parent = parent;
            } else {
                return;
            }

            const newConsideredTile = new PrioritizedLocation(l, cost, cost + heuristic(l));

            // Keep consideredTiles sorted descending by totalCost so pop() yields the lowest.
            // Seek from the end since recently added tiles are usually the cheapest.
            if (consideredTiles.length === 0) {
                consideredTiles.push(newConsideredTile);
                return;
            }
            let i = consideredTiles.length - 1;
            for (; i >= 0; i--) {
                if (newConsideredTile.totalCost < consideredTiles[i].totalCost) {
                    consideredTiles.insertAt(i + 1, newConsideredTile);
                    return;
                }
            }
            consideredTiles.insertAt(0, newConsideredTile);
        }

        updateOrFillLocation(start, null, 0);

        let end: SimpleLocation = null;
        while (consideredTiles.length !== 0) {
            const currLocation = consideredTiles.pop();

            if (isEnd(currLocation.loc)) {
                end = currLocation.loc;
                break;
            }

            const col = currLocation.loc.col;
            const row = currLocation.loc.row;
            const dataForCurrLocation = encounteredLocations[col][row];

            if (dataForCurrLocation.visited) continue;
            dataForCurrLocation.visited = true;

            const left = new SimpleLocation(col - 1, row);
            const right = new SimpleLocation(col + 1, row);
            const top = new SimpleLocation(col, row - 1);
            const bottom = new SimpleLocation(col, row + 1);

            const leftOpen = isWalkable(left, onTilesOf, tm);
            const rightOpen = isWalkable(right, onTilesOf, tm);
            const topOpen = isWalkable(top, onTilesOf, tm);
            const bottomOpen = isWalkable(bottom, onTilesOf, tm);

            const orthogonalCost = currLocation.cost + ORTHOGONAL_COST;
            if (leftOpen) updateOrFillLocation(left, dataForCurrLocation, orthogonalCost);
            if (rightOpen) updateOrFillLocation(right, dataForCurrLocation, orthogonalCost);
            if (topOpen) updateOrFillLocation(top, dataForCurrLocation, orthogonalCost);
            if (bottomOpen) updateOrFillLocation(bottom, dataForCurrLocation, orthogonalCost);

            if (movement === PathType.EightWay) {
                // Only step diagonally when both adjacent orthogonals are open (no corner-cutting through walls).
                const diagonalCost = currLocation.cost + DIAGONAL_COST;
                if (leftOpen && topOpen) {
                    const tl = new SimpleLocation(col - 1, row - 1);
                    if (isWalkable(tl, onTilesOf, tm)) updateOrFillLocation(tl, dataForCurrLocation, diagonalCost);
                }
                if (leftOpen && bottomOpen) {
                    const bl = new SimpleLocation(col - 1, row + 1);
                    if (isWalkable(bl, onTilesOf, tm)) updateOrFillLocation(bl, dataForCurrLocation, diagonalCost);
                }
                if (rightOpen && topOpen) {
                    const tr = new SimpleLocation(col + 1, row - 1);
                    if (isWalkable(tr, onTilesOf, tm)) updateOrFillLocation(tr, dataForCurrLocation, diagonalCost);
                }
                if (rightOpen && bottomOpen) {
                    const br = new SimpleLocation(col + 1, row + 1);
                    if (isWalkable(br, onTilesOf, tm)) updateOrFillLocation(br, dataForCurrLocation, diagonalCost);
                }
            }
        }

        const endCol = end && encounteredLocations[end.col];
        const endDataNode = endCol && endCol[end.row];

        if (!end || !endDataNode)
            return undefined;

        const output: tiles.Location[] = [];
        let curr = endDataNode;
        while (curr) {
            output.unshift(new tiles.Location(curr.l.col, curr.l.row, tm));
            curr = curr.parent;
        }

        return output;
    }

    function tileLocationHeuristic(tile: SimpleLocation, target: SimpleLocation, movement: PathType) {
        const xDist = Math.abs(target.col - tile.col);
        const yDist = Math.abs(target.row - tile.row);
        if (movement === PathType.FourWay) {
            return (xDist + yDist) * ORTHOGONAL_COST;
        }
        // Octile distance: matches the actual achievable cost when diagonals are available.
        return Math.max(xDist, yDist) * ORTHOGONAL_COST + Math.min(xDist, yDist) * (DIAGONAL_COST - ORTHOGONAL_COST);
    }

    function isWalkable(loc: SimpleLocation, onTilesOf: Image, tm: tiles.TileMap): boolean {
        if (tm.isObstacle(loc.col, loc.row)) return false;
        if (!onTilesOf) return true;
        const img = tm.getTileImage(tm.getTileIndex(loc.col, loc.row));
        return img.equals(onTilesOf);
    }
}
