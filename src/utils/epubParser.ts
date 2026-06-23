/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from "jszip";

export interface ParsedChapter {
  index: number;
  id: string;
  href: string; // original opf href
  zipPath: string; // full path inside zip
  title: string;
}

export interface ParsedBook {
  title: string;
  author: string;
  chapters: ParsedChapter[];
  zipInstance: JSZip;
  opfPath: string;
}

/**
 * Resolves a relative path to an absolute path inside the ZIP file.
 */
function resolveZipPath(basePath: string, relativePath: string): string {
  // basePath is e.g., "OEBPS/content.opf" -> base dir is "OEBPS"
  const parts = basePath.split("/");
  parts.pop(); // remove file name

  const relParts = relativePath.split("/");
  for (const part of relParts) {
    if (part === "" || part === ".") {
      continue;
    } else if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

/**
 * Parses an EPUB file (provided as ArrayBuffer) and extracts its structure.
 */
export async function parseEpub(arrayBuffer: ArrayBuffer): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. Read META-INF/container.xml to find the OPF file path
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) {
    throw new Error("Invalid EPUB: META-INF/container.xml is missing.");
  }
  const containerXmlText = await containerFile.async("text");
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXmlText, "text/xml");
  const rootfile = containerDoc.querySelector("rootfile");
  const opfPath = rootfile?.getAttribute("full-path");

  if (!opfPath) {
    throw new Error("Invalid EPUB: Could not locate container root file (.opf).");
  }

  // 2. Read OPF file content
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`OPF file not found at: ${opfPath}`);
  }
  const opfText = await opfFile.async("text");
  const opfDoc = parser.parseFromString(opfText, "text/xml");

  // 3. Extract Metadata
  let title = "Untitled Book";
  let author = "Unknown Author";

  const titleNode = opfDoc.getElementsByTagName("dc:title")[0] || opfDoc.querySelector("title");
  if (titleNode) {
    title = titleNode.textContent?.trim() || "Untitled Book";
  }

  const creatorNode = opfDoc.getElementsByTagName("dc:creator")[0] || opfDoc.querySelector("creator");
  if (creatorNode) {
    author = creatorNode.textContent?.trim() || "Unknown Author";
  }

  // 4. Map Manifest items
  const manifestItems = opfDoc.querySelectorAll("manifest > item");
  const manifestMap = new Map<string, { href: string; mediaType: string }>();
  manifestItems.forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type");
    if (id && href) {
      manifestMap.set(id, { href, mediaType: mediaType || "" });
    }
  });

  // 5. Build chapters list from Spine
  const spineItemrefs = opfDoc.querySelectorAll("spine > itemref");
  const chapters: ParsedChapter[] = [];
  let indexCounter = 0;

  for (let i = 0; i < spineItemrefs.length; i++) {
    const idref = spineItemrefs[i].getAttribute("idref");
    if (!idref) continue;

    const manifestItem = manifestMap.get(idref);
    if (manifestItem && (manifestItem.mediaType.includes("html") || manifestItem.mediaType.includes("xml"))) {
      const decodedHref = decodeURI(manifestItem.href);
      const zipPath = resolveZipPath(opfPath, decodedHref);

      // Verify the file actually exists inside the zip before adding it
      if (zip.file(zipPath)) {
        chapters.push({
          index: indexCounter++,
          id: idref,
          href: manifestItem.href,
          zipPath: zipPath,
          title: `Chapter ${indexCounter}`, // fallback, we will update titles dynamically or lazily
        });
      }
    }
  }

  // Optimize: Pre-fetch or extract initial headings for titles where possible
  // Let's check first if we can parse chapter headers to give them real titles
  for (const chapter of chapters) {
    try {
      const file = zip.file(chapter.zipPath);
      if (file) {
        const text = await file.async("text");
        const doc = parser.parseFromString(text, "text/html");
        
        // Find first header
        const header = doc.querySelector("h1, h2, h3, h4, title");
        if (header && header.textContent && header.textContent.trim().length > 1) {
          const rawTitle = header.textContent.trim();
          // Clean up weird whitespace leaks
          chapter.title = rawTitle.replace(/\s+/g, ' ');
        }
      }
    } catch {
      // ignore failures, keep fallback Chapter X
    }
  }

  return {
    title,
    author,
    chapters,
    zipInstance: zip,
    opfPath,
  };
}

/**
 * Loads a chapter XHTML file, extracts its body, and rewrites image assets to local ObjURLs.
 */
export async function loadChapterContent(
  zip: JSZip,
  chapterZipPath: string,
  onImageResolved?: (url: string) => void
): Promise<string> {
  const file = zip.file(chapterZipPath);
  if (!file) {
    return "<p class='error'>Chapter file load failed.</p>";
  }

  const rawText = await file.async("text");
  
  // Use HTML parser to parse XHTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawText, "text/html");

  // Iterate and rewrite <img> and SVG <image> tags so we load localized file asset URLs
  const imgElements = doc.querySelectorAll("img, image");
  for (const img of Array.from(imgElements)) {
    const src = img.getAttribute("src") || img.getAttribute("href") || img.getAttribute("xlink:href");
    if (src) {
      // Decode URL paths, handling %20 etc.
      const decodedSrc = decodeURI(src);
      // Images are relative to the XHTML file directory
      const imgZipPath = resolveZipPath(chapterZipPath, decodedSrc);
      const imgFile = zip.file(imgZipPath);

      if (imgFile) {
        try {
          const blob = await imgFile.async("blob");
          const localUrl = URL.createObjectURL(blob);
          if (img.tagName.toLowerCase() === "img") {
            img.setAttribute("src", localUrl);
          } else {
            img.setAttribute("href", localUrl);
            img.setAttribute("xlink:href", localUrl);
          }
          
          // Add custom elegant sizing and styles to inline content assets
          img.className = "max-w-full h-auto mx-auto my-6 rounded shadow-sm opacity-90 transition-opacity hover:opacity-100";
          img.setAttribute("referrerpolicy", "no-referrer");
          
          if (onImageResolved) {
            onImageResolved(localUrl);
          }
        } catch (e) {
          console.error("Failed to inline chapter inline asset:", imgZipPath, e);
        }
      }
    }
  }

  // Prevent SVG elements (especially cover pages) from stretching
  const svgElements = doc.querySelectorAll("svg");
  svgElements.forEach((svg) => {
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    
    const width = svg.getAttribute("width");
    const height = svg.getAttribute("height");
    const viewBox = svg.getAttribute("viewBox");
    
    if (!viewBox && width && height) {
      const wVal = parseFloat(width);
      const hVal = parseFloat(height);
      if (!isNaN(wVal) && !isNaN(hVal)) {
        svg.setAttribute("viewBox", `0 0 ${wVal} ${hVal}`);
      }
    }
    
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    
    svg.style.maxWidth = "100%";
    svg.style.maxHeight = "75vh";
    svg.style.width = "auto";
    svg.style.height = "auto";
    svg.style.display = "block";
    svg.style.margin = "auto";
  });

  // Clean links, make internal anchors open in a custom way or disable
  const links = doc.querySelectorAll("a");
  links.forEach((a) => {
    // If it's an external link, make it target _blank safely
    const href = a.getAttribute("href");
    if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    } else {
      // prevent internal jump link reloads
      a.removeAttribute("href");
      a.className = "text-inherit cursor-default no-underline";
    }
  });

  // Extract the main readable container block
  const body = doc.querySelector("body");
  if (!body) {
    return rawText;
  }

  // Remove any raw style tags so they don't break our theme styling
  const styleTags = body.querySelectorAll("style, link[rel='stylesheet']");
  styleTags.forEach((tag) => tag.remove());

  // Clean inline styles to allow typography panel overrides
  const styledElements = body.querySelectorAll("[style]");
  styledElements.forEach((el) => {
    const align = (el as HTMLElement).style.textAlign;
    el.removeAttribute("style");
    if (align) {
      (el as HTMLElement).style.textAlign = align;
    }
  });

  return body.innerHTML;
}
