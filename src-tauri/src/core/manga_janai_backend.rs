use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyModule};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub const DEFAULT_MANGA_JANAI_MODEL_DIR: &str =
    "D:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/model/MangaJaNai_V1_ModelsOnly";

const ILLUSJANAI_X2_FILE: &str = "2x_IllustrationJaNai_V1_ESRGAN_120k.pth";
const ILLUSJANAI_X4_FILE: &str = "4x_IllustrationJaNai_V1_ESRGAN_135k.pth";
const ILLUSJANAI_DAT2_X4_FILE: &str = "4x_IllustrationJaNai_V1_DAT2_190k.pth";

const HELPER_CODE: &str = r#"
import io
import os

MODEL_DIR = r"D:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/model/MangaJaNai_V1_ModelsOnly"
ALIASES = {
    "mangajanai_auto_x2": "2x_MangaJaNai_1600p_V1_ESRGAN_90k.pth",
    "manga_janai_auto_x2": "2x_MangaJaNai_1600p_V1_ESRGAN_90k.pth",
    "mangajanai_auto_x4": "4x_MangaJaNai_1600p_V1_ESRGAN_70k.pth",
    "manga_janai_auto_x4": "4x_MangaJaNai_1600p_V1_ESRGAN_70k.pth",
    "illusjanai_x2": "2x_IllustrationJaNai_V1_ESRGAN_120k.pth",
    "illusjannai_x2": "2x_IllustrationJaNai_V1_ESRGAN_120k.pth",
    "illustrationjanai_x2": "2x_IllustrationJaNai_V1_ESRGAN_120k.pth",
    "illusjanai_x4": "4x_IllustrationJaNai_V1_ESRGAN_135k.pth",
    "illusjannai_x4": "4x_IllustrationJaNai_V1_ESRGAN_135k.pth",
    "illustrationjanai_x4": "4x_IllustrationJaNai_V1_ESRGAN_135k.pth",
    "illusjanai_dat2_x4": "4x_IllustrationJaNai_V1_DAT2_190k.pth",
    "illusjannai_dat2_x4": "4x_IllustrationJaNai_V1_DAT2_190k.pth",
    "illustrationjanai_dat2_x4": "4x_IllustrationJaNai_V1_DAT2_190k.pth",
}

_loaded_model_file = None
_loaded_model = None
_loaded_scale = 1
_device = None


def set_model_dir(model_dir):
    global MODEL_DIR
    if model_dir:
        MODEL_DIR = str(model_dir)


def _normalize_name(value):
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def _resolve_model(model_name):
    requested = str(model_name or "").strip()
    key = _normalize_name(requested)
    filename = ALIASES.get(key)

    if not filename:
        if requested.lower().endswith(".pth"):
            if os.path.isabs(requested):
                path = requested
                filename = os.path.basename(requested)
            else:
                filename = os.path.basename(requested)
                path = os.path.join(MODEL_DIR, filename)
            if os.path.exists(path):
                return filename, path
            raise FileNotFoundError(path)

        candidates = [requested]
        if requested:
            candidates.append(requested + ".pth")
        for candidate in candidates:
            if not candidate:
                continue
            path = candidate if os.path.isabs(candidate) else os.path.join(MODEL_DIR, candidate)
            if os.path.exists(path):
                return os.path.basename(path), path

        filename = requested

    path = filename if os.path.isabs(filename) else os.path.join(MODEL_DIR, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    return os.path.basename(path), path


def _get_device(torch):
    global _device
    if _device is not None:
        return _device
    if torch.cuda.is_available():
        _device = torch.device("cuda")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        _device = torch.device("mps")
    else:
        _device = torch.device("cpu")
    return _device


def _load_model(filename, path):
    global _loaded_model_file, _loaded_model, _loaded_scale
    if _loaded_model_file == filename and _loaded_model is not None:
        return _loaded_model, _loaded_scale

    import torch
    from spandrel import ModelLoader

    device = _get_device(torch)
    model_desc = ModelLoader().load_from_file(path)
    model = model_desc.model
    scale = int(getattr(model_desc, "scale", 1) or 1)
    model.eval()
    model = model.to(device)

    _loaded_model_file = filename
    _loaded_model = model
    _loaded_scale = scale
    return _loaded_model, _loaded_scale


def _enhance_contrast(image):
    if image.mode != "L":
        probe = image.convert("L")
    else:
        probe = image

    hist = probe.histogram()
    new_black = 0
    global_max_black = hist[0]
    for idx in range(1, 31):
        if hist[idx] > global_max_black:
            global_max_black = hist[idx]
            new_black = idx

    continuous = 0
    for idx in range(31, 256):
        if hist[idx] > global_max_black:
            continuous = 0
            global_max_black = hist[idx]
            new_black = idx
        elif hist[idx] < global_max_black:
            continuous += 1
            if continuous > 1:
                break

    new_white = 255
    global_max_white = hist[255]
    for idx in range(254, 224, -1):
        if hist[idx] > global_max_white:
            global_max_white = hist[idx]
            new_white = idx

    continuous = 0
    for idx in range(223, -1, -1):
        if hist[idx] > global_max_white:
            continuous = 0
            global_max_white = hist[idx]
            new_white = idx
        elif hist[idx] < global_max_white:
            continuous += 1
            if continuous > 1:
                break

    if new_black == 0 and new_white == 255:
        return image

    div = max(new_white - new_black, 1)
    lut = []
    for idx in range(256):
        value = (idx - new_black) * 255.0 / div
        lut.append(max(0, min(255, int(value + 0.5))))

    if image.mode == "L":
        return image.point(lut)
    return image.convert("RGB").point(lut * 3)


def _process_single(image, model, model_scale):
    import numpy as np
    import torch
    from PIL import Image

    image = image.convert("RGB")
    original_w, original_h = image.size
    min_size = 40
    pad_w = (2 - original_w % 2) % 2
    pad_h = (2 - original_h % 2) % 2
    if original_w + pad_w < min_size:
        pad_w = min_size - original_w
    if original_h + pad_h < min_size:
        pad_h = min_size - original_h
    if (original_w + pad_w) % 2 != 0:
        pad_w += 1
    if (original_h + pad_h) % 2 != 0:
        pad_h += 1

    padded = pad_w > 0 or pad_h > 0
    if padded:
        next_image = Image.new("RGB", (original_w + pad_w, original_h + pad_h), (0, 0, 0))
        next_image.paste(image, (0, 0))
        image = next_image

    array = np.array(image, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(array).permute(2, 0, 1).unsqueeze(0).to(_get_device(torch))

    with torch.no_grad():
        output = model(tensor)
    if isinstance(output, (list, tuple)):
        output = output[0]

    output = output.squeeze(0).clamp(0, 1).permute(1, 2, 0).detach().cpu().numpy()
    output = (output * 255.0).round().astype(np.uint8)

    result = Image.fromarray(output, "RGB")
    if padded:
        result = result.crop((0, 0, original_w * model_scale, original_h * model_scale))
    return result


def _split_tiles(image, tile_size, overlap):
    width, height = image.size
    step = max(tile_size - overlap, 1)
    tiles = []
    y = 0
    while y < height:
        x = 0
        y_end = min(y + tile_size, height)
        while x < width:
            x_end = min(x + tile_size, width)
            tiles.append((image.crop((x, y, x_end, y_end)), (x, y, x_end - x, y_end - y)))
            if x_end >= width:
                break
            x += step
        if y_end >= height:
            break
        y += step
    return tiles


def _merge_tiles(tiles, original_size, model_scale, overlap):
    from PIL import Image

    original_w, original_h = original_size
    output_w = original_w * model_scale
    output_h = original_h * model_scale
    output = Image.new("RGB", (output_w, output_h))
    half_overlap = max(0, overlap * model_scale // 2)

    for tile, pos in tiles:
        x, y, width, height = pos
        left = 0 if x == 0 else half_overlap
        top = 0 if y == 0 else half_overlap
        right_edge = x + width >= original_w
        bottom_edge = y + height >= original_h
        right = tile.width if right_edge else max(left + 1, tile.width - half_overlap)
        bottom = tile.height if bottom_edge else max(top + 1, tile.height - half_overlap)
        cropped = tile.crop((left, top, right, bottom))
        paste_x = min(x * model_scale + left, output_w - cropped.width)
        paste_y = min(y * model_scale + top, output_h - cropped.height)
        output.paste(cropped, (paste_x, paste_y))

    return output


def _process_tiled(image, model, model_scale, tile_size):
    from PIL import Image

    image = image.convert("RGB")
    overlap = 16
    tiles = _split_tiles(image, max(int(tile_size), 1), overlap)
    processed = []
    for tile, pos in tiles:
        original_w, original_h = tile.size
        if original_w != tile_size or original_h != tile_size:
            padded = Image.new("RGB", (tile_size, tile_size), (0, 0, 0))
            padded.paste(tile, (0, 0))
            tile_for_infer = padded
        else:
            tile_for_infer = tile

        result = _process_single(tile_for_infer, model, model_scale)
        expected = (original_w * model_scale, original_h * model_scale)
        if result.size != expected:
            result = result.crop((0, 0, expected[0], expected[1]))
        processed.append((result, pos))

    return _merge_tiles(processed, image.size, model_scale, overlap)


def upscale_image(image_data, model_name, scale, tile_size, timeout):
    from PIL import Image

    filename, path = _resolve_model(model_name)
    model, model_scale = _load_model(filename, path)
    image = Image.open(io.BytesIO(bytes(image_data)))
    image.load()
    image = _enhance_contrast(image)

    tile_size = int(tile_size or 0)
    if tile_size > 0:
        output = _process_tiled(image, model, model_scale, tile_size)
    else:
        output = _process_single(image, model, model_scale)

    requested_scale = int(scale or model_scale)
    if requested_scale > 0 and model_scale > 0 and requested_scale != model_scale:
        ratio = requested_scale / float(model_scale)
        output = output.resize(
            (max(1, round(output.size[0] * ratio)), max(1, round(output.size[1] * ratio))),
            resample=Image.Resampling.BILINEAR,
        )

    buffer = io.BytesIO()
    output.convert("RGB").save(buffer, format="WEBP", quality=95, method=4)
    return buffer.getvalue()
"#;

pub struct MangaJaNaiBackend {
    model_dir: Mutex<PathBuf>,
    helper_module: Py<PyModule>,
}

impl MangaJaNaiBackend {
    pub fn new() -> Result<Self, PyErr> {
        let helper_module = Python::with_gil(|py| {
            PyModule::from_code_bound(
                py,
                HELPER_CODE,
                "neoview_manga_janai_inline",
                "neoview_manga_janai_inline",
            )
            .map(|module| module.into())
        })?;

        Ok(Self {
            model_dir: Mutex::new(PathBuf::from(DEFAULT_MANGA_JANAI_MODEL_DIR)),
            helper_module,
        })
    }

    pub fn set_model_dir(&self, model_dir: &str) -> Result<(), PyErr> {
        if !model_dir.trim().is_empty() {
            let mut guard = self.model_dir.lock().map_err(|error| {
                PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                    "Failed to lock MangaJaNai model directory: {error}"
                ))
            })?;
            *guard = PathBuf::from(model_dir);
        }

        Python::with_gil(|py| {
            self.helper_module
                .bind(py)
                .getattr("set_model_dir")?
                .call1((model_dir,))?;
            Ok(())
        })
    }

    pub fn get_available_models(&self) -> Vec<String> {
        let mut models = vec![
            "ILLUSJANAI_X2".to_string(),
            "ILLUSJANAI_X4".to_string(),
            "ILLUSJANAI_DAT2_X4".to_string(),
        ];

        let model_dir = match self.model_dir.lock() {
            Ok(guard) => guard.clone(),
            Err(_) => PathBuf::from(DEFAULT_MANGA_JANAI_MODEL_DIR),
        };

        if let Ok(entries) = fs::read_dir(model_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let is_pth = path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case("pth"))
                    .unwrap_or(false);
                if is_pth {
                    if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
                        models.push(name.to_string());
                    }
                }
            }
        }

        models.sort();
        models.dedup();
        models
    }

    pub fn is_supported_model(&self, model_name: &str) -> bool {
        let normalized = normalize_model_name(model_name);
        if normalized.is_empty() {
            return false;
        }

        normalized.ends_with(".pth")
            || matches!(
                normalized.as_str(),
                "illusjanai_x2"
                    | "illusjannai_x2"
                    | "illustrationjanai_x2"
                    | "illusjanai_x4"
                    | "illusjannai_x4"
                    | "illustrationjanai_x4"
                    | "illusjanai_dat2_x4"
                    | "illusjannai_dat2_x4"
                    | "illustrationjanai_dat2_x4"
            )
            || normalized.contains("mangajanai")
            || normalized.contains("manga_janai")
            || normalized.contains("illusjanai")
            || normalized.contains("illusjannai")
            || normalized.contains("illustrationjanai")
            || normalized.contains("illustration_janai")
    }

    pub fn upscale_image(
        &self,
        image_data: &[u8],
        model_name: &str,
        scale: i32,
        tile_size: i32,
        timeout: f64,
    ) -> Result<Vec<u8>, PyErr> {
        Python::with_gil(|py| {
            let py_bytes = PyBytes::new_bound(py, image_data);
            let result = self
                .helper_module
                .bind(py)
                .getattr("upscale_image")?
                .call1((py_bytes, model_name, scale, tile_size, timeout))?;
            result.extract()
        })
    }
}

fn normalize_model_name(model_name: &str) -> String {
    model_name.trim().to_lowercase().replace(['-', ' '], "_")
}

#[allow(dead_code)]
fn alias_to_filename(model_name: &str) -> Option<&'static str> {
    match normalize_model_name(model_name).as_str() {
        "illusjanai_x2" | "illusjannai_x2" | "illustrationjanai_x2" => Some(ILLUSJANAI_X2_FILE),
        "illusjanai_x4" | "illusjannai_x4" | "illustrationjanai_x4" => Some(ILLUSJANAI_X4_FILE),
        "illusjanai_dat2_x4" | "illusjannai_dat2_x4" | "illustrationjanai_dat2_x4" => {
            Some(ILLUSJANAI_DAT2_X4_FILE)
        }
        _ => None,
    }
}
