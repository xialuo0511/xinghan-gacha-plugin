import assert from "node:assert/strict"
import test from "node:test"

import {
  getYunzaiRuntime,
  resetYunzaiRuntimeForTest,
} from "../../src/adapters/yunzai/runtime.js"
import { UigfService } from "../../src/export/uigfService.js"
import { ExportStore } from "../../src/storage/exportStore.js"
import { GitUpdateService } from "../../src/update/gitUpdateService.js"
import { RecordViewService } from "../../src/view/recordViewService.js"

test("exposes export, UIGF, and update services to Yunzai apps", context => {
  const previousRedis = globalThis.redis
  context.after(() => {
    resetYunzaiRuntimeForTest()
    globalThis.redis = previousRedis
  })
  globalThis.redis = {
    set: async () => "OK",
    get: async () => undefined,
    del: async () => 0,
  }
  resetYunzaiRuntimeForTest()

  const runtime = getYunzaiRuntime()
  assert.ok(runtime.exportStore instanceof ExportStore)
  assert.ok(runtime.uigfService instanceof UigfService)
  assert.ok(runtime.updateService instanceof GitUpdateService)
  assert.ok(runtime.recordViewService instanceof RecordViewService)
})
