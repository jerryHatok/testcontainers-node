import { log } from "../../logger";
import { DockerImageName } from "../../docker-image-name";
import { Command } from "../types";
import { dockerode } from "../dockerode";
import { pullImage } from "./image/pull-image";
import { startContainer } from "./container/start-container";
import { attachContainer } from "./container/attach-container";
import { inspectContainer } from "./container/inspect-container";

export const runInContainer = async (image: string, command: Command[]): Promise<string | undefined> => {
  try {
    const imageName = DockerImageName.fromString(image);

    await pullImage({ imageName, force: false });

    log.debug(`Creating container: ${image} with command: ${command.join(" ")}`);
    const container = await dockerode.createContainer({ Image: image, Cmd: command });
    log.debug(`Attaching to container: ${container.id}`);
    const stream = await attachContainer(container);

    const promise = new Promise<string>((resolve) => {
      const chunks: string[] = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(chunks.join("").trim()));

      const interval = setInterval(async () => {
        const inspect = await inspectContainer(container);

        if (inspect.state.status === "exited") {
          clearInterval(interval);
          stream.destroy();
        }
      }, 50);
    });

    log.debug(`Starting container: ${container.id}`);
    await startContainer(container);
    log.debug(`Waiting for container output: ${container.id}`);
    const output = await promise;

    if (output.length === 0) {
      return undefined;
    } else {
      return output;
    }
  } catch (err) {
    log.error(`Failed to run command in container: "${command.join(" ")}", error: "${err}"`);
    return undefined;
  }
};