import { GameSyncService } from "./gameSyncService.js"

export class ZzzSyncService extends GameSyncService {
  constructor(options) {
    super({ ...options, game: "zzz" })
  }
}
