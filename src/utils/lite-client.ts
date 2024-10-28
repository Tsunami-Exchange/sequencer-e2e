import { LiteClient, LiteEngine, LiteRoundRobinEngine, LiteSingleEngine } from 'ton-lite-client';

function intToIP(int: number) {
  const part1 = int & 255;
  const part2 = (int >> 8) & 255;
  const part3 = (int >> 16) & 255;
  const part4 = (int >> 24) & 255;

  return part4 + '.' + part3 + '.' + part2 + '.' + part1;
}

class _TonLiteClient {
  private engine: LiteEngine;
  private engines: LiteEngine[];
  private client: LiteClient;

  async init() {
    if (this.client) {
      return this.client;
    }
    const tonConfigResponse = await fetch('https://ton.org/testnet-global.config.json');
    const tonConfig: any = await tonConfigResponse.json();
    this.engines = tonConfig.liteservers.slice(1, 2).map(
      (ls: any) =>
        new LiteSingleEngine({
          host: `tcp://${intToIP(ls.ip)}:${ls.port}`,
          publicKey: Buffer.from(ls.id.key, 'base64'),
        })
    );

    this.engine = new LiteRoundRobinEngine(this.engines);
    this.client = new LiteClient({ engine: this.engine });
    return this.client;
  }

  close() {
    for (const engine of this.engines) {
      engine.close();
    }
    this.engine?.close();
  }
}

export const TonLiteClient = new _TonLiteClient();
