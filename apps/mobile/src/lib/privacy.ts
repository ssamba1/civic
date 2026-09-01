import { ImageFormat, Skia, TileMode } from "@shopify/react-native-skia";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const MAX_EDGE = 1280;
const BLUR_SIGMA = 24;

export interface ProcessedPhoto {
  publicUri: string;
  rawUri: string;
  blurVersion: 1;
}

/**
 * Normalize orientation/metadata, then blur the complete public derivative.
 * Without an on-device detector, fixed bands can silently miss a face or plate.
 * A whole-image blur is deliberately conservative and keeps the original only
 * in restricted storage.
 * The public output is never derived by copying the original file.
 */
export async function processPhotoOnDevice(
  uri: string,
  reportId: string,
  sourceSize?: { width: number; height: number },
): Promise<ProcessedPhoto> {
  const context = ImageManipulator.manipulate(uri);
  if (sourceSize && Math.max(sourceSize.width, sourceSize.height) > MAX_EDGE) {
    context.resize(
      sourceSize.width >= sourceSize.height
        ? { width: MAX_EDGE, height: null }
        : { width: null, height: MAX_EDGE },
    );
  }
  const rendered = await context.renderAsync();
  const normalized = await rendered.saveAsync({
    compress: 0.8,
    format: SaveFormat.JPEG,
  });

  const folder = new Directory(Paths.document, "reports", reportId);
  folder.create({ intermediates: true, idempotent: true });
  const rawFile = new File(folder, "original.jpg");
  new File(normalized.uri).copy(rawFile);

  let image: ReturnType<typeof Skia.Image.MakeImageFromEncoded> | null = null;
  let surface: ReturnType<typeof Skia.Surface.MakeOffscreen> | null = null;
  let paint: ReturnType<typeof Skia.Paint> | null = null;
  try {
    const encoded = await rawFile.bytes();
    image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(encoded));
    if (!image) throw new Error("The selected photo could not be decoded.");

    surface = Skia.Surface.MakeOffscreen(image.width(), image.height());
    if (!surface)
      throw new Error(
        "Private image processing is unavailable on this device.",
      );
    paint = Skia.Paint();
    paint.setImageFilter(
      Skia.ImageFilter.MakeBlur(BLUR_SIGMA, BLUR_SIGMA, TileMode.Clamp, null),
    );
    surface.getCanvas().drawImage(image, 0, 0, paint);
    surface.flush();

    const publicBytes = surface
      .makeImageSnapshot()
      .encodeToBytes(ImageFormat.WEBP, 80);
    const publicFile = new File(folder, "public.webp");
    publicFile.create({ overwrite: true });
    publicFile.write(publicBytes);
    return { publicUri: publicFile.uri, rawUri: rawFile.uri, blurVersion: 1 };
  } catch (error) {
    if (folder.exists) folder.delete();
    throw error;
  } finally {
    image?.dispose();
    paint?.dispose();
    surface?.dispose();
  }
}

export function removeProcessedPhotos(reportId: string): void {
  const folder = new Directory(Paths.document, "reports", reportId);
  if (folder.exists) folder.delete();
}
