import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import bwip from 'bwip-js';
import { Resvg } from '@resvg/resvg-js';
import { PDFDocument, rgb } from 'pdf-lib';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import type { CodePrintOptions, PrintReport } from '@qrgenerator/contracts';
import { CodeError } from '../errors/code.error.js';

const require = createRequire(import.meta.url);
// No runtime CDN or outbound request is needed for validation.
prepareZXingModule({
  overrides: {
    wasmBinary: readFileSync(
      require.resolve('zxing-wasm/reader/zxing_reader.wasm'),
    ),
  },
});

const instructions = [
  'Use the original vector SVG or PDF, at 100% actual size. Disable fit-to-page, shrink-to-fit and driver scaling. Do not use screenshots, JPEG, interpolation or anti-aliased resampling.',
  'Use the stated printer DPI and integer dots per module in both directions. Recalculate the artwork for any other resolution. Measure a physical proof; PDF viewers may enlarge tiny pages.',
  'Print solid black modules on a uniform opaque matte white background. White in a file does not put white ink onto silver foil: the printer must supply a validated white underprint or suitable substrate.',
  'Keep the entire quiet zone empty and white. No text, borders, logos, perforations, seams, folds, embossing, cavities or other graphics may enter it.',
  'Place each unique code behind its assigned tablet cavity using an approved blister die-line. Keep it on a flat area and outside cutting, sealing and opening damage. This file is a single code, not a registered ten-cavity production layout.',
  'Do not duplicate a unit code across tablets. Bind positions to the actual manufacturing records before release. Reprints of a unit retain the same identity; control and destroy rejected or surplus impressions.',
  'Qualify on the actual foil, ink, press, sealing and cutting process. Test representative phones and cameras at realistic distances, angles, lighting and after handling/aging. Data Matrix may require a compatible scanner app.',
  'Have a qualified print provider verify symbol quality using the applicable ISO/IEC 15415 process and agree the acceptance grade and sampling plan. A successful software decode is not print qualification.',
  'The public page shows the medicine data supplied for the linked batch, but the identifier does not by itself prove authenticity or medicine safety. Do not release on saleable medicines until the data, packaging and applicable regulatory checks are approved.',
];

export function svgFor(
  matrix: string[],
  report: Pick<
    PrintReport,
    'quietZoneModulesPerSide' | 'totalModules' | 'dotsPerModule' | 'printerDpi'
  >,
): string {
  const q = report.quietZoneModulesPerSide;
  const size =
    (report.totalModules * report.dotsPerModule * 25.4) / report.printerDpi;
  const paths: string[] = [];
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '1') paths.push(`M${x + q} ${y + q}h1v1h-1z`);
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.toFixed(9)}mm" height="${size.toFixed(9)}mm" viewBox="0 0 ${report.totalModules} ${report.totalModules}" shape-rendering="crispEdges"><rect width="${report.totalModules}" height="${report.totalModules}" fill="#fff"/><path fill="#000" d="${paths.join('')}"/></svg>`;
}

export async function pdfFor(
  matrix: string[],
  report: PrintReport,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const modulePoints = (report.dotsPerModule * 72) / report.printerDpi;
  const side = report.totalModules * modulePoints;
  const page = document.addPage([side, side]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: side,
    height: side,
    color: rgb(1, 1, 1),
  });
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '1') continue;
      page.drawRectangle({
        x: (x + report.quietZoneModulesPerSide) * modulePoints,
        y: side - (y + report.quietZoneModulesPerSide + 1) * modulePoints,
        width: modulePoints,
        height: modulePoints,
        color: rgb(0, 0, 0),
      });
    }
  });
  document.setTitle('Unit code — actual size; see print report');
  return document.save();
}

export async function renderCode(text: string, options: CodePrintOptions) {
  if (
    options.format === 'qr' &&
    options.errorCorrection === 'L' &&
    options.printMode !== 'experimental'
  ) {
    throw new CodeError(
      'EXPERIMENTAL_REQUIRED',
      'QR level L requires printMode experimental. Use M, Q or H for the standard profile.',
    );
  }
  let symbol: { pixs: number[]; pixx: number; pixy: number } | undefined;
  try {
    const encoderOptions =
      options.format === 'qr'
        ? {
            bcid: 'qrcode',
            text,
            eclevel: options.errorCorrection,
            fixedeclevel: true,
            ...(options.version === undefined
              ? {}
              : { version: options.version }),
          }
        : { bcid: 'datamatrix', text };
    const result = bwip.raw(encoderOptions)[0];
    if (result && 'pixs' in result) symbol = result;
  } catch {
    throw new CodeError(
      'SYMBOL_CAPACITY_EXCEEDED',
      'The full secure URL does not fit the requested symbol. Remove version or use a shorter configured scan domain; identifiers are never truncated.',
    );
  }
  if (!symbol || symbol.pixx !== symbol.pixy)
    throw new Error('Encoder returned an invalid square matrix');
  const n = symbol.pixx;
  const pixels = symbol.pixs;
  const matrix = Array.from({ length: n }, (_, y) =>
    pixels.slice(y * n, (y + 1) * n).join(''),
  );
  const quiet = options.format === 'qr' ? 4 : 1;
  const total = n + quiet * 2;
  const dots = Math.max(
    options.printMode === 'standard' ? 4 : 1,
    Math.ceil((options.moduleSizeMm * options.printerDpi) / 25.4 - 1e-10),
  );
  const moduleMm = (dots * 25.4) / options.printerDpi;
  const totalMm = total * moduleMm;
  if (options.maxSizeMm !== undefined && totalMm > options.maxSizeMm + 1e-9) {
    throw new CodeError(
      'PRINT_AREA_TOO_SMALL',
      'The full symbol and quiet zone do not fit. Increase the available square; the symbol was not shrunk.',
      {
        requiredSizeMm: totalMm,
        maxSizeMm: options.maxSizeMm,
        symbolModules: n,
        totalModules: total,
        dotsPerModule: dots,
      },
    );
  }
  const warnings = [
    'Physical scanning on foil and target phones has NOT been qualified. Neither profile guarantees scan success.',
    'A valid code lookup is not proof of authenticity; a printed code can be copied.',
  ];
  if (moduleMm < 0.25)
    warnings.push(
      'Small modules: close-focus limitations, foil glare, ink spread and damage can prevent phone scanning.',
    );
  if (options.printMode === 'experimental')
    warnings.push(
      'Experimental size / print profile: laboratory proof only, not approved for production.',
    );
  if (options.format === 'data_matrix')
    warnings.push(
      'Data Matrix native-camera URL opening is not universal. Validate each target device or provide a compatible scanner. This is plain ECC200, not GS1 DataMatrix.',
    );
  if (Math.abs(moduleMm - options.moduleSizeMm) > 1e-9)
    warnings.push(
      'Requested module size was increased to whole printer dots and the selected profile minimum. Use actualModuleSizeMm.',
    );
  const round = (value: number) => Number(value.toFixed(6));
  const report: PrintReport = {
    format: options.format,
    encoder: `bwip-js ${bwip.BWIPJS_VERSION}`,
    version: options.format === 'qr' ? String((n - 17) / 4) : `${n}x${n}`,
    errorCorrection:
      options.format === 'qr' ? options.errorCorrection : 'ECC200',
    encodedCharacters: text.length,
    symbolModules: n,
    quietZoneModulesPerSide: quiet,
    totalModules: total,
    requestedModuleSizeMm: options.moduleSizeMm,
    actualModuleSizeMm: round(moduleMm),
    symbolSizeMm: round(n * moduleMm),
    quietZoneMmPerSide: round(quiet * moduleMm),
    totalSizeMm: round(totalMm),
    printerDpi: options.printerDpi,
    dotsPerModule: dots,
    totalPrinterDots: total * dots,
    printMode: options.printMode,
    digitalVerification: 'passed',
    physicalQualification: 'not_tested',
    svgSha256: '',
    warnings,
    instructions,
  };
  const svg = svgFor(matrix, report);
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: report.totalPrinterDots },
  })
    .render()
    .asPng();
  const results = await readBarcodes(png, {
    formats: [options.format === 'qr' ? 'QRCode' : 'DataMatrix'],
    tryHarder: true,
  });
  if (results.length !== 1 || results[0]?.text !== text) {
    throw new CodeError(
      'DIGITAL_VERIFICATION_FAILED',
      'Independent decoding failed at the target dot size; increase module size or printer DPI.',
    );
  }
  report.svgSha256 = createHash('sha256').update(svg).digest('hex');
  return { matrix, report, svg };
}
