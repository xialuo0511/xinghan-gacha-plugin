function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

export const GAME_DEFINITIONS = deepFreeze({
  genshin: {
    displayName: "原神",
    roleBizCandidates: ["hk4e_cn", "hk4e_global"],
    markets: {
      cn: { gameBiz: "hk4e_cn", regions: ["cn_gf01", "cn_qd01"] },
      global: {
        gameBiz: "hk4e_global",
        regions: ["os_usa", "os_euro", "os_asia", "os_cht"],
      },
    },
    pools: [
      { queryType: "100", name: "新手祈愿", endpointKind: "standard", responseTypes: ["100"] },
      { queryType: "200", name: "常驻祈愿", endpointKind: "standard", responseTypes: ["200"] },
      {
        queryType: "301",
        name: "角色活动祈愿",
        endpointKind: "standard",
        responseTypes: ["301", "400"],
      },
      { queryType: "302", name: "武器活动祈愿", endpointKind: "standard", responseTypes: ["302"] },
      { queryType: "500", name: "集录祈愿", endpointKind: "standard", responseTypes: ["500"] },
    ],
  },
  starrail: {
    displayName: "崩坏：星穹铁道",
    roleBizCandidates: ["hkrpg_cn", "hkrpg_global"],
    markets: {
      cn: { gameBiz: "hkrpg_cn", regions: ["prod_gf_cn", "prod_qd_cn"] },
      global: {
        gameBiz: "hkrpg_global",
        regions: [
          "prod_official_usa",
          "prod_official_eur",
          "prod_official_asia",
          "prod_official_cht",
        ],
      },
    },
    pools: [
      { queryType: "1", name: "群星跃迁", endpointKind: "standard", responseTypes: ["1"] },
      { queryType: "2", name: "始发跃迁", endpointKind: "standard", responseTypes: ["2"] },
      { queryType: "11", name: "角色活动跃迁", endpointKind: "standard", responseTypes: ["11"] },
      { queryType: "12", name: "光锥活动跃迁", endpointKind: "standard", responseTypes: ["12"] },
      {
        queryType: "21",
        name: "角色联动跃迁",
        endpointKind: "collaboration",
        responseTypes: ["21"],
      },
      {
        queryType: "22",
        name: "光锥联动跃迁",
        endpointKind: "collaboration",
        responseTypes: ["22"],
      },
    ],
  },
  zzz: {
    displayName: "绝区零",
    roleBizCandidates: ["nap_cn", "nap_global"],
    markets: {
      cn: { gameBiz: "nap_cn", regions: ["prod_gf_cn"] },
      global: {
        gameBiz: "nap_global",
        regions: ["prod_gf_us", "prod_gf_eu", "prod_gf_jp", "prod_gf_sg"],
      },
    },
    pools: [
      {
        queryType: "1",
        longType: "1001",
        name: "常驻频段",
        endpointKind: "standard",
        responseTypes: ["1", "1001"],
      },
      {
        queryType: "2",
        longType: "2001",
        name: "独家频段",
        endpointKind: "standard",
        responseTypes: ["2", "2001"],
      },
      {
        queryType: "3",
        longType: "3001",
        name: "音擎频段",
        endpointKind: "standard",
        responseTypes: ["3", "3001"],
      },
      {
        queryType: "5",
        longType: "5001",
        name: "邦布频段",
        endpointKind: "standard",
        responseTypes: ["5", "5001"],
      },
      {
        queryType: "102",
        longType: "12001",
        name: "独家重映",
        endpointKind: "standard",
        responseTypes: ["102", "12001"],
      },
      {
        queryType: "103",
        longType: "13001",
        name: "音擎回响",
        endpointKind: "standard",
        responseTypes: ["103", "13001"],
      },
    ],
  },
})
