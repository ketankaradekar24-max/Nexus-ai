import React, { useCallback, useEffect, useState } from 'react';
import {
  Download,
  Eye,
  FolderPlus,
  ImagePlus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { GeneratedImageItem, ProjectItem } from '../types';

const AuthImage: React.FC<{ imageId: number; alt: string; className?: string }> = ({
  imageId,
  alt,
  className,
}) => {
  const { apiFetch } = useAuth();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    apiFetch(`/api/images/${imageId}/file`)
      .then(async (r) => {
        if (!r.ok) return null;
        return r.blob();
      })
      .then((blob) => {
        if (!active || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiFetch, imageId]);

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-neutral-200 dark:bg-neutral-900 text-xs text-neutral-500 ${className || ''}`}
      >
        Loading image...
      </div>
    );
  }
  return <img src={src} alt={alt} referrerPolicy="no-referrer" className={className} />;
};

export const ImageStudioView: React.FC = () => {
  const { apiFetch } = useAuth();
  const [tab, setTab] = useState<'generate' | 'vision'>('generate');

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [model, setModel] = useState<'gemini-3.1-flash-lite-image' | 'gemini-nano-banana-2.1'>(
    'gemini-3.1-flash-lite-image',
  );
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('1K');
  const [stylePreset, setStylePreset] = useState('none');
  const [variations, setVariations] = useState(1);
  const [refImage, setRefImage] = useState<{ mimeType: string; base64Data: string; name: string } | null>(
    null,
  );

  const [generating, setGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GeneratedImageItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [lightboxImg, setLightboxImg] = useState<GeneratedImageItem | null>(null);

  // Vision Q&A state
  const [visionImage, setVisionImage] = useState<{
    mimeType: string;
    base64Data: string;
    previewUrl: string;
  } | null>(null);
  const [visionQuestion, setVisionQuestion] = useState('');
  const [visionAnswer, setVisionAnswer] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  const loadGallery = useCallback(async () => {
    const [imgRes, projRes] = await Promise.all([apiFetch('/api/images'), apiFetch('/api/projects')]);
    if (imgRes.ok) {
      const data = await imgRes.json();
      setGallery(data.images || []);
    }
    if (projRes.ok) {
      const pData = await projRes.json();
      setProjects(pData.projects || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  const handleEnhancePrompt = async () => {
    if (!prompt.trim() || enhancing) return;
    setEnhancing(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/images/enhance-prompt', {
        method: 'POST',
        body: JSON.stringify({ prompt, stylePreset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Prompt enhancement failed.');
      setPrompt(data.enhancedPrompt);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Enhancement failed.');
    } finally {
      setEnhancing(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/images/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          negativePrompt,
          model,
          aspectRatio,
          resolution,
          stylePreset,
          variations,
          referenceImage: refImage
            ? { mimeType: refImage.mimeType, base64Data: refImage.base64Data }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image generation failed.');
      await loadGallery();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Image generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (img: GeneratedImageItem) => {
    const res = await apiFetch(`/api/images/${img.id}/file`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sub-ai-image-${img.id}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/api/images/${id}`, { method: 'DELETE' });
    setGallery((p) => p.filter((x) => x.id !== id));
    if (lightboxImg?.id === id) setLightboxImg(null);
  };

  const handleSaveToProject = async (imageId: number, projectId: number | null) => {
    await apiFetch(`/api/images/${imageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ projectId }),
    });
    await loadGallery();
  };

  const handlePickRef = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      setRefImage({
        name: file.name,
        mimeType: file.type || 'image/png',
        base64Data: res.split(',')[1] || '',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleVisionUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      setVisionImage({
        mimeType: file.type || 'image/png',
        base64Data: res.split(',')[1] || '',
        previewUrl: res,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visionImage || !visionQuestion.trim()) return;
    setAnalyzing(true);
    setVisionAnswer('');
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/images/analyze', {
        method: 'POST',
        body: JSON.stringify({
          mimeType: visionImage.mimeType,
          base64Data: visionImage.base64Data,
          question: visionQuestion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Visual Q&A failed.');
      setVisionAnswer(data.answer);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Image Studio & Visual Intelligence</h1>
            <p className="text-xs text-neutral-500 mt-1">
              Text-to-image, reference-based editing, variations, and visual Q&A. Image generation models require a billing-enabled Gemini key in Settings &gt; Secrets.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-200/70 dark:bg-[#181A20]">
            <button
              type="button"
              onClick={() => setTab('generate')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                tab === 'generate'
                  ? 'bg-white dark:bg-[#0C0D10] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Generate & Edit
            </button>
            <button
              type="button"
              onClick={() => setTab('vision')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                tab === 'vision'
                  ? 'bg-white dark:bg-[#0C0D10] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Visual Q&A
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        {tab === 'generate' ? (
          <>
            <form
              onSubmit={handleGenerate}
              className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-4"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Image Prompt {refImage ? '(Editing / Image-to-Image mode active)' : ''}
                  </label>
                  <button
                    type="button"
                    onClick={handleEnhancePrompt}
                    disabled={enhancing || !prompt.trim()}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B8893A] dark:text-[#D4B483] hover:opacity-80 disabled:opacity-40 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{enhancing ? 'Enhancing...' : 'Enhance Prompt'}</span>
                  </button>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe the scene, lighting, subject, lens, or edit instructions..."
                  className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] text-sm focus:outline-none focus:ring-1 focus:ring-[#D4B483]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Model</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value as typeof model)}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
                  >
                    <option value="gemini-3.1-flash-lite-image">Nano Banana Lite</option>
                    <option value="gemini-nano-banana-2.1">Nano Banana 2.1 (1K–4K)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Aspect Ratio</label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
                  >
                    <option value="1:1">1:1 Square</option>
                    <option value="16:9">16:9 Landscape</option>
                    <option value="9:16">9:16 Vertical</option>
                    <option value="4:3">4:3 Editorial</option>
                    <option value="3:4">3:4 Portrait</option>
                    {model === 'gemini-nano-banana-2.1' && (
                      <>
                        <option value="4:1">4:1 Panoramic</option>
                        <option value="1:4">1:4 Banner</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Resolution</label>
                  <select
                    value={resolution}
                    disabled={model !== 'gemini-nano-banana-2.1'}
                    onChange={(e) => setResolution(e.target.value as typeof resolution)}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] disabled:opacity-40"
                  >
                    <option value="1K">1K Standard</option>
                    <option value="2K">2K High</option>
                    <option value="4K">4K Ultra</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Style Preset</label>
                  <select
                    value={stylePreset}
                    onChange={(e) => setStylePreset(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
                  >
                    <option value="none">None (Prompt Driven)</option>
                    <option value="photorealistic documentary photography, natural shadows">
                      Documentary Photo
                    </option>
                    <option value="minimalist studio product photography on travertine">
                      Minimalist Studio
                    </option>
                    <option value="architectural editorial wide shot, golden hour">
                      Architectural
                    </option>
                    <option value="clean technical isometric illustration, crisp lighting">
                      Technical Isometric
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Variations</label>
                  <select
                    value={variations}
                    onChange={(e) => setVariations(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
                  >
                    <option value={1}>1 Image</option>
                    <option value={2}>2 Variations</option>
                    <option value={3}>3 Variations</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{refImage ? refImage.name : 'Reference Image (Edit / Img2Img)'}</span>
                    <input type="file" accept="image/*" onChange={handlePickRef} className="hidden" />
                  </label>
                  {refImage && (
                    <button
                      type="button"
                      onClick={() => setRefImage(null)}
                      className="text-xs text-red-500 cursor-pointer"
                    >
                      Clear reference
                    </button>
                  )}
                  <input
                    type="text"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="Optional things to avoid..."
                    className="px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] w-56"
                  />
                </div>

                <button
                  type="submit"
                  disabled={generating || !prompt.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ImagePlus className="w-4 h-4" />
                  <span>{generating ? 'Generating...' : 'Generate Image'}</span>
                </button>
              </div>
            </form>

            {/* Gallery */}
            <div>
              <h2 className="font-display text-sm font-semibold mb-3">
                Generated Gallery ({gallery.length})
              </h2>
              {gallery.length === 0 ? (
                <div className="p-10 text-center rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 text-xs text-neutral-500">
                  Generated images are saved securely in your private gallery. Create your first image above.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {gallery.map((img) => (
                    <div
                      key={img.id}
                      className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] flex flex-col"
                    >
                      <div
                        onClick={() => setLightboxImg(img)}
                        className="aspect-square bg-neutral-100 dark:bg-[#0C0D10] cursor-pointer overflow-hidden"
                      >
                        <AuthImage
                          imageId={img.id}
                          alt={img.prompt}
                          className="w-full h-full object-cover hover:scale-[1.02] transition-transform"
                        />
                      </div>
                      <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                        <div>
                          <p className="text-xs line-clamp-2 leading-relaxed">{img.prompt}</p>
                          <div className="mt-1.5 text-[11px] text-neutral-500 flex items-center gap-1.5">
                            <span>{img.aspectRatio}</span>
                            <span>·</span>
                            <span>{img.resolution}</span>
                            <span>·</span>
                            <span className="truncate">{img.model}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                          <select
                            value={img.projectId ?? ''}
                            onChange={(e) =>
                              handleSaveToProject(
                                img.id,
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                            aria-label="Assign image to project"
                            className="text-[11px] px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-transparent max-w-[125px]"
                          >
                            <option value="">No project</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setPrompt(img.prompt)}
                              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 cursor-pointer"
                              title="Reuse prompt"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setLightboxImg(img)}
                              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 cursor-pointer"
                              title="Preview"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownload(img)}
                              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 cursor-pointer"
                              title="Download"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(img.id)}
                              className="p-1.5 rounded hover:bg-red-500/10 text-neutral-500 hover:text-red-500 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-4">
            <h2 className="font-display text-base font-semibold">
              Visual Question Answering & Image Understanding
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="block p-6 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 text-center cursor-pointer hover:border-[#D4B483]">
                  <FolderPlus className="w-6 h-6 mx-auto mb-2 text-neutral-400" />
                  <span className="text-xs text-neutral-500">
                    Click to upload an image for inspection (PNG, JPG, WebP)
                  </span>
                  <input type="file" accept="image/*" onChange={handleVisionUpload} className="hidden" />
                </label>
                {visionImage && (
                  <img
                    src={visionImage.previewUrl}
                    alt="Uploaded for visual Q&A"
                    className="w-full max-h-72 object-contain rounded-xl border border-neutral-200 dark:border-neutral-800"
                  />
                )}
              </div>
              <form onSubmit={handleAnalyzeImage} className="space-y-3">
                <textarea
                  value={visionQuestion}
                  onChange={(e) => setVisionQuestion(e.target.value)}
                  rows={4}
                  placeholder="Ask anything about this image: extract text, explain charts, inspect UI layout, identify objects..."
                  className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] text-sm"
                />
                <button
                  type="submit"
                  disabled={!visionImage || !visionQuestion.trim() || analyzing}
                  className="px-4 py-2 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold disabled:opacity-40 cursor-pointer"
                >
                  {analyzing ? 'Analyzing...' : 'Analyze Image'}
                </button>
                {visionAnswer && (
                  <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] text-sm whitespace-pre-wrap leading-relaxed">
                    {visionAnswer}
                  </div>
                )}
              </form>
            </div>
          </div>
        )}
      </div>

      {lightboxImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="max-w-4xl w-full rounded-2xl bg-[#14151A] border border-neutral-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <span className="text-xs text-neutral-300 truncate">{lightboxImg.prompt}</span>
              <button
                type="button"
                onClick={() => setLightboxImg(null)}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex justify-center bg-black/40">
              <AuthImage
                imageId={lightboxImg.id}
                alt={lightboxImg.prompt}
                className="max-h-[72vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
