import { getIO } from '../../config/socket.js';
import { logger } from '../../config/logger.js';

export class RealtimeService {
  /**
   * Broadcasts a real-time event to connected POS clients in the restaurant tenant room.
   */
  public static emitToRestaurant(restaurantId: string, event: string, payload: unknown): void {
    try {
      const io = getIO();
      const enrichedPayload = {
        ...(typeof payload === 'object' && payload !== null ? payload : { data: payload }),
        restaurantId,
        timestamp: new Date().toISOString(),
      };

      io.to(`restaurant_${restaurantId}`).emit(event, enrichedPayload);
      io.emit(event, enrichedPayload); // broadcast for global floor subscribers

      logger.debug({ restaurantId, event }, '📡 Real-time event emitted');
    } catch {
      // Gracefully handle situations where Socket.IO is not yet initialized (e.g. CLI/tests)
    }
  }
}
