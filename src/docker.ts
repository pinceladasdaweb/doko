import path from "path"
import { spawnSync, execSync, ExecSyncOptions } from "child_process"
import fs from "fs"
import yaml from "js-yaml"
import { DOCKER_COMPOSE_PATH, DOKO_DIR } from "./constants"
import { z } from "zod"

export const DockerComposeServiceConfigSchema = z.object({
  container_name: z.string().optional(),
  image: z.string().optional(),
  ports: z.array(z.string()).optional(),
  environment: z.array(z.string()).optional(),
  volumes: z.array(z.string()).optional(),
})

export type DockerComposeServiceConfig = z.infer<
  typeof DockerComposeServiceConfigSchema
>

export type DockerComposeData = {
  version?: string
  services?: {
    [name: string]: DockerComposeServiceConfig
  }
  volumes?: {
    [name: string]: any
  }
}

let requireSudo: boolean | undefined

export function checkDockerPermission() {
  if (typeof requireSudo === "boolean") return requireSudo

  const cmd = spawnSync("docker", ["ps"])
  const output = cmd.stderr.toString()

  if (cmd.status === 0) {
    requireSudo = false
  } else {
    if (output.includes("permission denied")) {
      requireSudo = true
    } else {
      throw new Error(output)
    }
  }

  return requireSudo
}

export function readDockerCompose(): DockerComposeData {
  if (!fs.existsSync(DOCKER_COMPOSE_PATH)) return {}
  const content = fs.readFileSync(DOCKER_COMPOSE_PATH, "utf8")
  const data = yaml.load(content) as DockerComposeData
  return data
}

export function writeDockerCompose(data: DockerComposeData) {
  const content = yaml.dump(data)
  fs.mkdirSync(path.dirname(DOCKER_COMPOSE_PATH), { recursive: true })
  fs.writeFileSync(
    DOCKER_COMPOSE_PATH,
    `# AUTO-GENERATED BY DOKO, PLEASE DON'T MODIFY\n${content}`,
    "utf8",
  )
}

export function runDockerCommand(
  command: string,
  { stdio }: { stdio?: "inherit" | "pipe" } = {},
) {
  const requireSudo = checkDockerPermission()
  const options: ExecSyncOptions = {
    cwd: DOKO_DIR,
    stdio: stdio || "inherit",
  }
  if (requireSudo) {
    return execSync(`sudo -- su -c '${command}'`, options)
  }
  return execSync(command, options)
}

export function dockerComposeUp() {
  runDockerCommand(`docker-compose up -d --remove-orphans`)
}

export function dockerComposeDown() {
  runDockerCommand(`docker-compose down`)
}

export function dockerComposeRemoveServices(serviceNames: string[]) {
  runDockerCommand(`docker-compose rm -s -v -f ${serviceNames.join(" ")}`)
}

export function getRunningDockerContainers() {
  const output = runDockerCommand(`docker ps --format "{{json .}}\\n\\n"`, {
    stdio: "pipe",
  })
    .toString()
    .trim()

  if (!output) return []

  const services: { Names: string }[] = output
    .split(/\n{2,}/)
    .map((v) => JSON.parse(v))

  return services
}

export function isDockerContainerRunning(containerName: string) {
  const running =
    runDockerCommand(
      `docker ps --filter "name=${containerName}" --format "{{json .}}"`,
      { stdio: "pipe" },
    )
      .toString()
      .trim() !== ""

  return running
}
