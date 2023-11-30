// noinspection JSUnusedGlobalSymbols
interface Window {
  tagifyWebpage: (tagLeafTexts?: boolean) => { [key: number]: string };
  removeTags: () => void;
}

const elIsClean = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();

  // @ts-ignore
  const isHidden = el.style?.display === "none" || el.hidden || el.disabled;
  const isZeroSize = rect.width === 0 || rect.height === 0;
  const isScriptOrStyle = el.tagName === "SCRIPT" || el.tagName === "STYLE";

  return !isHidden && !isZeroSize && !isScriptOrStyle;
};

const inputs = ["a", "button", "textarea", "select", "details", "label"];
const isInteractable = (el: HTMLElement) =>
  inputs.includes(el.tagName.toLowerCase()) ||
  // @ts-ignore
  (el.tagName.toLowerCase() === "input" && el.type !== "hidden") ||
  el.role === "button";

const isTextInsertable = (el: HTMLElement) =>
  (["input", "textarea"].includes(el.tagName.toLowerCase()));

const emptyTagWhitelist = ["input", "textarea", "select", "button"];
const isEmpty = (el: HTMLElement) => {
  const tagName = el.tagName.toLowerCase();
  if (emptyTagWhitelist.includes(tagName)) return false;
  if ("innerText" in el && el.innerText.trim().length === 0) {
    // look for svg or img in the element
    const svg = el.querySelector("svg");
    const img = el.querySelector("img");

    if (svg || img) return false;

    return true;
  }

  return false;
};

function getElementXPath(element: HTMLElement | null) {
  let path_parts = [];

  let iframe_str = "";
  if (element && element.ownerDocument !== window.document) {
    // assert element.iframe_index !== undefined, "Element is not in the main document and does not have an iframe_index attribute";
    iframe_str = `iframe[${element.getAttribute("iframe_index")}]`;
  }

  while (element) {
    if (!element.tagName) {
      element = element.parentNode as HTMLElement | null;
      continue;
    }

    let prefix = element.tagName.toLowerCase();
    let sibling_index = 1;

    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === element.tagName) {
        sibling_index++;
      }
      sibling = sibling.previousElementSibling;
    }

    // Check next siblings to determine if index should be added
    let nextSibling = element.nextElementSibling;
    let shouldAddIndex = false;
    while (nextSibling) {
      if (nextSibling.tagName === element.tagName) {
        shouldAddIndex = true;
        break;
      }
      nextSibling = nextSibling.nextElementSibling;
    }

    if (sibling_index > 1 || shouldAddIndex) {
      prefix += `[${sibling_index}]`;
    }

    if (element.id) {
      prefix += `[@id="${element.id}"]`;
      path_parts.unshift(prefix);
      return "//" + path_parts.join("/");
    } else if (element.className) {
      const classList = Array.from(element.classList);
      const class_conditions = classList
        .map(
          (single_class) =>
            `contains(concat(" ", normalize-space(@class), " "), " ${single_class} ")`,
        )
        .join(" and ");

      if (class_conditions.length > 0) {
        prefix += `[${class_conditions}]`;
      }
    }

    path_parts.unshift(prefix);
    element = element.parentNode as HTMLElement | null;
  }
  return iframe_str + "//" + path_parts.join("/");
}

function create_tagged_span(idStr: string) {
  let idSpan = document.createElement("span");
  idSpan.id = "__tarsier_id";
  idSpan.style.all = "inherit";
  idSpan.style.display = "inline";
  idSpan.style.color = "white";
  idSpan.style.backgroundColor = "red";
  idSpan.textContent = idStr;
  return idSpan;
}

window.tagifyWebpage = (tagLeafTexts = false) => {
  window.removeTags();

  let idNum = 0;
  let idToXpath: Record<number, string> = {};

  // @ts-ignore
  let allElements: HTMLElement[] = [...document.body.querySelectorAll("*")];
  const iframes = document.getElementsByTagName("iframe");

  // add elements in iframes to allElements
  for (let i = 0; i < iframes.length; i++) {
    try {
      const frame = iframes[i];
      console.log("iframe!", iframes[i]);
      const iframeDocument =
        frame.contentDocument || frame.contentWindow?.document;

      // @ts-ignore
      const iframeElements = [...iframeDocument.querySelectorAll("*")];
      iframeElements.forEach((el) => el.setAttribute("iframe_index", i));
      allElements.push(...iframeElements);
    } catch (e) {
      // Cross-origin iframe error
      console.error("Cross-origin iframe:", e);
    }
  }

  // ignore all children of interactable elements
  allElements.map((el) => {
    if (isInteractable(el)) {
      el.childNodes.forEach((child) => {
        const index = allElements.indexOf(child as HTMLElement);
        if (index > -1) {
          allElements.splice(index, 1);
        }
      });
    }
  });

  for (let el of allElements) {
    if (isEmpty(el) || !elIsClean(el)) {
      continue;
    }

    idToXpath[idNum] = getElementXPath(el);

    if (isInteractable(el)) {
      idNum++;
    } else if (tagLeafTexts) {
      for (let child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && /\S/.test(child.textContent || "")) {
          // This is a text node with non-whitespace text
          idNum++;
        }
      }
    }
  }

  idNum = 0;
  for (let el of allElements) {
    if (isEmpty(el) || !elIsClean(el)) {
      continue;
    }

    const idStr = isTextInsertable(el) ? `{${idNum}}` : `[${idNum}]`;
    let idSpan = create_tagged_span(idStr);

    if (isInteractable(el)) {
      el.prepend(idSpan);
      idNum++;
    } else if (tagLeafTexts) {
      for (let child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && /\S/.test(child.textContent || "")) {
          // This is a text node with non-whitespace text
          let idSpan = create_tagged_span(idStr);
          el.insertBefore(idSpan, child);
          idNum++;
        }
      }
    }
  }

  return idToXpath;
};

window.removeTags = () => {
  const tags = document.querySelectorAll("#__tarsier_id");
  tags.forEach((tag) => tag.remove());
};
