/**
 * Texto para comparar sin importar mayúsculas ni tildes (2026-11-06): "Jose" encuentra a "José",
 * "Neuquen" es "Neuquén" y "Nunez" es "Núñez". Para buscar y para detectar nombres repetidos.
 */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-AR').trim();
}
