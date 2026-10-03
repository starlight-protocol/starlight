import { startStudio, StudioOptions, StudioServer } from '@starlight-protocol/starlight/studio';

const options: StudioOptions = { port: 0, outputDir: './runs', agents: [{
    name: 'example', canHandle: () => true, run: () => ({ status: 'completed' })
}] };
const server: Promise<StudioServer> = startStudio(options);
// @ts-expect-error Studio cannot be publicly bound through configuration
startStudio({ host: '0.0.0.0' });
// @ts-expect-error port is an integer, not text
startStudio({ port: '8080' });
void server;
