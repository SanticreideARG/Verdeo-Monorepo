/**
 * Las últimas duraciones de petición de **esta instancia** del servidor.
 *
 * En un servicio sin estado cada instancia tiene su propia memoria y vive poco, así que esto es
 * una muestra de la instancia que contesta, no una métrica global: sirve para ver si el servidor
 * anda lento ahora, no para armar un histórico. El histórico de errores sí se guarda en la base.
 */
export class RequestStats {
  private readonly samples: number[] = [];

  public constructor(private readonly capacity = 300) {}

  public record(durationMs: number): void {
    this.samples.push(durationMs);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  public summary(): { count: number; max: number | null; p50: number | null; p95: number | null } {
    if (this.samples.length === 0) return { count: 0, max: null, p50: null, p95: null };
    const sorted = [...this.samples].sort((a, b) => a - b);
    const at = (fraction: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? null;
    return {
      count: sorted.length,
      max: sorted[sorted.length - 1] ?? null,
      p50: at(0.5),
      p95: at(0.95),
    };
  }
}
