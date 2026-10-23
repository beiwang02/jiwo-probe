import { test } from 'node:test'
import assert from 'node:assert/strict'
import { averageLoad, formatCapacity, formatSize, meterTone, probeHealthIssue, relativeTime, sortProbeServers, todayTrafficTotal } from './probe-overview.ts'

const GB = 1024 ** 3

test('已用 / 总量：两边同一单位，去掉多余的 .0', () => {
  assert.equal(formatCapacity(1 * GB, 8 * GB), '1 / 8 GB')
  assert.equal(formatCapacity(1.5 * GB, 2 * GB), '1.5 / 2 GB')
  assert.equal(formatCapacity(18.4 * GB, 20 * GB), '18.4 / 20 GB')
  assert.equal(formatCapacity(300 * 1024 ** 2, 512 * 1024 ** 2), '300 / 512 MB')
  assert.equal(formatCapacity(150 * GB, 500 * GB), '150 / 500 GB')
  assert.equal(formatSize(20 * GB), '20 GB')
})

test('健康判定：取超过 90% 里最严重的一项，离线机器不判', () => {
  const server = { online: true, cpu_pct: 38, mem_used: 1.5, mem_total: 2, disk_used: 92.1, disk_total: 100, traffic_limit: 100 }
  assert.deepEqual(probeHealthIssue(server, 30), { key: 'disk', pct: 92.1 })
  assert.equal(probeHealthIssue({ ...server, disk_used: 50 }, 30), undefined)
  assert.equal(probeHealthIssue({ ...server, disk_used: 50 }, 95)?.key, 'traffic')
  assert.equal(probeHealthIssue({ ...server, online: false }, 99), undefined)
})

test('进度条配色：超过 90% 红，超过 70% 黄', () => {
  assert.equal(meterTone(95), 'bad')
  assert.equal(meterTone(90), 'warn')
  assert.equal(meterTone(71), 'warn')
  assert.equal(meterTone(70), undefined)
})

test('今日流量：合计各服务器最新一天的日流量，都没有时返回 undefined', () => {
  assert.equal(todayTrafficTotal([
    { online: true, daily_traffic: [{ date: '2026-10-21', total: 5 }, { date: '2026-10-22', total: 7 }] },
    { online: true, daily_traffic: [{ date: '2026-10-22', total: 3 }] },
    { online: false },
  ]), 10)
  assert.equal(todayTrafficTotal([{ online: true }]), undefined)
})

test('平均占用：只算在线且上报了该项的服务器', () => {
  const load = averageLoad([
    { online: true, cpu_pct: 10, mem_used: 1, mem_total: 4 },
    { online: true, cpu_pct: 30 },
    { online: false, cpu_pct: 90 },
  ])
  assert.equal(load.cpu, 20)
  assert.equal(load.mem, 25)
  assert.equal(load.disk, undefined)
})

test('排序：没有数据的排最后，相同时保持原顺序', () => {
  const list = [
    { index: 0, server: { online: true, name: 'b', cpu_pct: 5 } },
    { index: 1, server: { online: true, name: 'a' } },
    { index: 2, server: { online: true, name: 'c', cpu_pct: 50 } },
    { index: 3, server: { online: true, name: 'd', cpu_pct: 5 } },
  ]
  const used = () => 0
  assert.deepEqual(sortProbeServers(list, 'cpu', used).map((x) => x.index), [2, 0, 3, 1])
  assert.deepEqual(sortProbeServers(list, 'name', used).map((x) => x.server.name), ['a', 'b', 'c', 'd'])
  assert.equal(sortProbeServers(list, 'default', used), list)
})

test('排序：延迟按最低的一条从小到大，失败的 -1 不算', () => {
  const list = [
    { index: 0, server: { online: true, ping: [{ current_ms: 80 }, { current_ms: -1 }] } },
    { index: 1, server: { online: true, ping: [{ current_ms: -1 }] } },
    { index: 2, server: { online: true, ping: [{ current_ms: 30 }, { current_ms: 120 }] } },
  ]
  assert.deepEqual(sortProbeServers(list, 'latency', () => 0).map((x) => x.index), [2, 0, 1])
})

test('相对时间：刚刚、分钟、小时、天', () => {
  const now = Date.parse('2026-10-22T01:49:00Z')
  assert.equal(relativeTime('2026-10-22T01:12:00Z', now), '37 分钟前')
  assert.equal(relativeTime('2026-10-22T01:48:40Z', now), '刚刚')
  assert.equal(relativeTime('2026-10-20T01:00:00Z', now), '2 天前')
  assert.equal(relativeTime('坏数据', now), '')
})
