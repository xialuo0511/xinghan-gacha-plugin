import { GameSyncService } from "./gameSyncService.js"

export class StarRailSyncService extends GameSyncService {
  constructor(options) {
    super({ ...options, game: "starrail" })
  }
}
