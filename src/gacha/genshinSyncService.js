import { GameSyncService } from "./gameSyncService.js"

export class GenshinSyncService extends GameSyncService {
  constructor(options) {
    super({ ...options, game: "genshin" })
  }
}
