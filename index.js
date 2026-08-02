import { readdir } from "node:fs/promises"

const directory = new URL("./apps/", import.meta.url)
const files = (await readdir(directory, { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith(".js"))
  .map(entry => entry.name)
  .sort()

const modules = await Promise.all(files.map(file => import(new URL(file, directory))))

export const apps = Object.fromEntries(
  modules.map((module, index) => {
    const name = files[index].slice(0, -3)
    const App = module[name] ?? module.default
    if (typeof App !== "function") {
      throw new TypeError(`TRSS app module ${name} must export a class named ${name}`)
    }
    return [name, App]
  }),
)
