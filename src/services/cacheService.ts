import { RedisService } from "ondc-automation-cache-lib";

export class CacheService {
  static async set(key: string, value: string): Promise<void> {
    await RedisService.setKey(key, value);
  }

  static async get(key: string): Promise<string | null> {
    const value = await RedisService.getKey(key);
    return value;
  }
}


