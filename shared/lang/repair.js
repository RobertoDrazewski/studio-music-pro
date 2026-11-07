// Arreglos automáticos para errores de escritura muy comunes de los modelos de IA, antes de validar el código.
// Hoy: los bemoles y sostenidos mal escritos ("ef3", "cs4", "Eb3", "F♯") pasan a la forma que entiende el lenguaje ("eb3", "c#4").

// Una nota dentro de un patrón: letra, alteración opcional (#, b, s, f, ♯, ♭) y octava. No toca nada que no tenga esa forma.
const NOTE = /(?<![A-Za-z0-9#♯♭])([A-Ga-g])([#bsfBSF♯♭]?)(-?\d)(?![A-Za-z0-9])/g;

export function normalizeNotes(code) {
  return String(code)
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      // Los comentarios y las líneas de texto hablado (voice, mic) llevan comillas pero no son patrones: no se tocan.
      if (trimmed.startsWith('//') || /^(voice|mic)\b/.test(trimmed)) return line;
      // Solo cambio lo que está entre comillas (los patrones).
      return line.replace(/"([^"]*)"/g, (_m, inner) =>
        `"${inner.replace(NOTE, (_n, letter, acc, octave) => `${letter.toLowerCase()}${acc === '' ? '' : /[#sS♯]/.test(acc) ? '#' : 'b'}${octave}`)}"`);
    })
    .join('\n');
}
