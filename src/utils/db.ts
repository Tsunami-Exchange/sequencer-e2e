import { Client, PoolClient, QueryResult, QueryResultRow } from 'pg';
import Pool from 'pg-pool';

interface DatabaseConfig {
  user: string;
  host: string;
  database: string;
  password: string;
  port: number;
}

class DatabaseClient<T extends Client> {
  private pool: Pool<T>;

  constructor(
    config: DatabaseConfig = {
      database: 'timescale_db',
      host: '95.179.137.235',
      port: 5432,
      user: 'storm_user',
      password: process.env.DB_PASSWORD ?? '',
    }
  ) {
    const { password } = config; // Destructure the password property
    if (!password) {
      throw new Error('DB_password is not set');
    }
    this.pool = new Pool(config);
  }

  // Query method
  async query<T extends QueryResultRow>(queryText: string, params?: any[]): Promise<QueryResult<T>> {
    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      const result = await client.query<T>(queryText, params);
      return result;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async getTraderPositions(trader: string) {
    const result = await this.query<Record<string, any>>('SELECT * FROM trader_position WHERE trader = $1', [trader]);
    return result.rows;
  }

  async getOrderV2(trader: string) {
    const result = await this.query<Record<string, any>>('SELECT * FROM order_v2 WHERE trader = $1', [trader]);
    return result.rows;
  }

  async getOrderHistory(trader: string) {
    const result = await this.query<Record<string, any>>('SELECT * FROM order_history WHERE trader = $1', [trader]);
    return result.rows;
  }

  // Disconnect pool
  async disconnect(): Promise<void> {
    await this.pool.end();
  }
}

export default DatabaseClient;

/*

*/
