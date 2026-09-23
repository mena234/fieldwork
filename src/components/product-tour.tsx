"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CircleHelp,
  ClipboardCheck,
  FileText,
  Leaf,
  MapPin,
  RefreshCw,
  Route,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import type { Lang } from "@/lib/types";

type Copy = { en: string; hi: string };
type Step = {
  id: string;
  label: Copy;
  title: Copy;
  body: Copy;
  tip: Copy;
  icon: typeof Users;
  route?: string;
  target?: string;
};
type Session = {
  index: number;
  hash: string;
  scrollY: number;
  stayOnPage: boolean;
  steps: Step[];
};
type Spotlight = { top: number; left: number; width: number; height: number };

function stepsFor(
  hasProject: boolean,
  farmerId: string | undefined,
  demo: boolean,
): Step[] {
  const welcome: Step = {
    id: "welcome",
    icon: Leaf,
    label: { en: "A quick introduction", hi: "एक छोटा परिचय" },
    title: { en: "Welcome to Fieldwork", hi: "Fieldwork में आपका स्वागत है" },
    body: {
      en: "A shared field notebook for carbon projects. Surveyors collect farmer records and evidence; supervisors check the work before it is accepted.",
      hi: "कार्बन परियोजनाओं के लिए एक साझा फील्ड नोटबुक। सर्वेक्षक किसानों के रिकॉर्ड और प्रमाण जुटाते हैं; पर्यवेक्षक काम स्वीकार करने से पहले उसकी जाँच करते हैं।",
    },
    tip: {
      en: demo
        ? "You’re in a local demo with sample farmers. You can explore and make changes on this device; cloud sync and supervisor decisions need a connected account."
        : "Your workspace contains the projects assigned to your account. Download a project while online to prepare for fieldwork.",
      hi: demo
        ? "आप नमूना किसानों वाला स्थानीय डेमो देख रहे हैं। इस डिवाइस पर बदलाव कर सकते हैं; क्लाउड सिंक और पर्यवेक्षक के निर्णय के लिए जुड़ा हुआ खाता चाहिए।"
        : "आपके खाते को सौंपी गई परियोजनाएँ यहाँ मिलती हैं। फील्डवर्क की तैयारी के लिए ऑनलाइन रहते हुए परियोजना डाउनलोड करें।",
    },
  };
  const finish: Step = {
    id: "finish",
    icon: CheckCheck,
    label: { en: "Ready for the field", hi: "फील्डवर्क के लिए तैयार" },
    title: { en: "You know your way around.", hi: "अब आप ऐप से परिचित हैं।" },
    body: {
      en: hasProject
        ? "Start with a farmer, add a visit, then follow its progress from saved on this device to synced and reviewed."
        : "Choose a project assigned to your account and download its farmers and forms. Then you can work in the field without a connection.",
      hi: hasProject
        ? "किसान चुनें, नई विज़िट जोड़ें, फिर डिवाइस पर सहेजने से लेकर सिंक और समीक्षा तक उसकी स्थिति देखें।"
        : "अपने खाते को सौंपी गई परियोजना चुनें और उसके किसान व फ़ॉर्म डाउनलोड करें। फिर बिना इंटरनेट के भी फील्ड में काम कर सकते हैं।",
    },
    tip: {
      en: "Need a reminder? “Take a tour” is always in the top bar.",
      hi: "दोबारा देखना चाहें? ऊपर “ऐप का परिचय” हमेशा उपलब्ध है।",
    },
  };
  if (!hasProject)
    return [
      welcome,
      {
        id: "project",
        icon: WifiOff,
        label: {
          en: "Prepare your workspace",
          hi: "अपना कार्यक्षेत्र तैयार करें",
        },
        title: {
          en: "Download before you head out",
          hi: "निकलने से पहले डाउनलोड करें",
        },
        body: {
          en: "Choose an assigned project here while online. Downloading brings its farmer records and published forms onto this device. If no projects appear, your project admin needs to assign you to one.",
          hi: "ऑनलाइन रहते हुए यहाँ सौंपी गई परियोजना चुनें। डाउनलोड से किसानों के रिकॉर्ड और प्रकाशित फ़ॉर्म इस डिवाइस पर आ जाते हैं। कोई परियोजना न दिखे तो परियोजना एडमिन से उसे सौंपने के लिए कहें।",
        },
        tip: {
          en: "Look for “Ready for offline use” before leaving your connection. Keep this browser’s site data to retain local work.",
          hi: "इंटरनेट से दूर जाने से पहले “Ready for offline use” देखें। स्थानीय काम बनाए रखने के लिए ब्राउज़र का साइट डेटा रखें।",
        },
        target: "project-download",
      },
      finish,
    ];
  return [
    welcome,
    {
      id: "farmers",
      icon: Users,
      route: "farmers",
      target: "farmers",
      label: { en: "01 · Your starting point", hi: "01 · यहाँ से शुरू करें" },
      title: {
        en: "One farmer, one connected record",
        hi: "एक किसान, एक जुड़ा हुआ रिकॉर्ड",
      },
      body: {
        en: "Find a farmer by name, village or reference. Filters help you find visits awaiting review or needing changes. Open a farmer to see their full history; use “Register farmer” for someone new.",
        hi: "नाम, गाँव या संदर्भ से किसान खोजें। फ़िल्टर से समीक्षा या सुधार की प्रतीक्षा वाली विज़िट खोजें। पूरा इतिहास देखने के लिए किसान खोलें; नए किसान के लिए “Register farmer” चुनें।",
      },
      tip: {
        en: "A farmer is the person. A visit is a separate record of work with that person. One farmer can have many visits.",
        hi: "किसान एक व्यक्ति है। विज़िट उस व्यक्ति के साथ किए काम का अलग रिकॉर्ड है। एक किसान की कई विज़िट हो सकती हैं।",
      },
    },
    {
      id: "timeline",
      icon: Route,
      route: farmerId ? `profile/${farmerId}` : "farmers",
      target: farmerId ? "timeline" : "farmers",
      label: { en: "02 · Follow the journey", hi: "02 · पूरी प्रक्रिया देखें" },
      title: {
        en: "Every visit adds to the story",
        hi: "हर विज़िट इतिहास में जुड़ती है",
      },
      body: {
        en: farmerId
          ? "This farmer’s timeline keeps previous visits together. Use “New visit” to choose a stage. Repeat monitoring visits create new records, so earlier observations stay available."
          : "After registering your first farmer, their profile will hold the complete visit timeline. Choose “New visit” and a stage; repeat monitoring visits keep earlier observations available.",
        hi: farmerId
          ? "इस किसान की टाइमलाइन में पिछली विज़िट एक साथ हैं। “New visit” से चरण चुनें। हर निगरानी विज़िट नया रिकॉर्ड बनाती है, इसलिए पुराने अवलोकन भी उपलब्ध रहते हैं।"
          : "पहला किसान पंजीकृत करने के बाद उसकी प्रोफ़ाइल में पूरी विज़िट टाइमलाइन होगी। “New visit” और चरण चुनें; निगरानी की नई विज़िट पुराने अवलोकन सुरक्षित रखती है।",
      },
      tip: {
        en: "Baseline → consent → farm boundary → planting → monitoring. Each stage has its own form and review status.",
        hi: "बेसलाइन → सहमति → खेत की सीमा → रोपण → निगरानी। हर चरण का अपना फ़ॉर्म और समीक्षा स्थिति है।",
      },
    },
    {
      id: "forms",
      icon: FileText,
      route: "forms",
      target: "forms",
      label: { en: "03 · Collect the evidence", hi: "03 · प्रमाण इकट्ठा करें" },
      title: {
        en: "The right questions for each stage",
        hi: "हर चरण के लिए सही सवाल",
      },
      body: {
        en: "The form library lets you inspect the questions. To fill one in, open a farmer and start a visit. Forms guide you through required answers, photos and location evidence, with English and Hindi labels.",
        hi: "फ़ॉर्म लाइब्रेरी में सवाल देख सकते हैं। फ़ॉर्म भरने के लिए किसान खोलें और नई विज़िट शुरू करें। फ़ॉर्म में ज़रूरी जवाब, फ़ोटो और स्थान के प्रमाण लिए जाते हैं; लेबल अंग्रेज़ी और हिन्दी में हैं।",
      },
      tip: {
        en: "Changes save on this device as you work. “Submit for review” checks the required fields and marks the visit as ready for a supervisor.",
        hi: "काम करते समय बदलाव इस डिवाइस पर सहेजे जाते हैं। “Submit for review” ज़रूरी फ़ील्ड जाँचकर विज़िट को पर्यवेक्षक के लिए तैयार करता है।",
      },
    },
    {
      id: "map",
      icon: MapPin,
      route: "map",
      target: "map",
      label: { en: "04 · Put work on the map", hi: "04 · नक्शे पर काम देखें" },
      title: {
        en: "Connect records to real places",
        hi: "रिकॉर्ड को असली स्थानों से जोड़ें",
      },
      body: {
        en: "The field map shows farmer locations. Saved farm boundaries appear below it. Capture GPS when registering a farmer; collect boundary points in a boundary visit and check the reported accuracy.",
        hi: "फील्ड मैप किसानों के स्थान दिखाता है। सहेजी गई खेत की सीमाएँ नीचे दिखती हैं। किसान पंजीकरण पर GPS लें; सीमा वाली विज़िट में बिंदु दर्ज करें और बताई गई सटीकता जाँचें।",
      },
      tip: {
        en: "Saved coordinates and boundary outlines remain available offline. The background map needs an internet connection.",
        hi: "सहेजे गए निर्देशांक और सीमा की रूपरेखा ऑफलाइन उपलब्ध रहती है। पृष्ठभूमि के नक्शे के लिए इंटरनेट चाहिए।",
      },
    },
    {
      id: "sync",
      icon: RefreshCw,
      route: "sync",
      target: "sync",
      label: {
        en: "05 · Get work to your team",
        hi: "05 · टीम तक काम पहुँचाएँ",
      },
      title: {
        en: "Saved here. Synced when connected.",
        hi: "यहाँ सहेजें। जुड़ने पर सिंक करें।",
      },
      body: {
        en: "Offline changes wait in the sync queue. With a connected account, sync runs when you reconnect, or you can choose “Sync now”. Check pending items, failures and conflicts before calling the work uploaded.",
        hi: "ऑफलाइन बदलाव सिंक कतार में रहते हैं। जुड़े खाते में इंटरनेट लौटने पर सिंक चलता है, या “Sync now” चुन सकते हैं। काम अपलोड हुआ मानने से पहले लंबित आइटम, त्रुटियाँ और टकराव जाँचें।",
      },
      tip: {
        en: demo
          ? "This demo keeps changes locally. It cannot upload them. “Pending” means the server has not confirmed receipt; it does not mean your local save failed."
          : "“Pending” means the server has not confirmed receipt. “Synced” confirms upload. Neither status means the visit has been approved.",
        hi: demo
          ? "यह डेमो बदलाव स्थानीय रूप से रखता है, अपलोड नहीं करता। “Pending” का अर्थ है सर्वर ने प्राप्ति की पुष्टि नहीं की; इसका मतलब स्थानीय सेव असफल होना नहीं है।"
          : "“Pending” का अर्थ है सर्वर ने प्राप्ति की पुष्टि नहीं की। “Synced” अपलोड की पुष्टि करता है। किसी भी स्थिति का अर्थ विज़िट की स्वीकृति नहीं है।",
      },
    },
    {
      id: "review",
      icon: ClipboardCheck,
      route: "review",
      target: "review",
      label: { en: "06 · Close the loop", hi: "06 · समीक्षा पूरी करें" },
      title: { en: "A second pair of eyes", hi: "एक और नज़र से जाँच" },
      body: {
        en: "Supervisors and project admins review synchronized submissions online. They can approve a visit or return it with a comment. If changes are requested, open the visit, correct it and submit it again.",
        hi: "पर्यवेक्षक और परियोजना एडमिन सिंक की गई प्रविष्टियों की ऑनलाइन समीक्षा करते हैं। वे विज़िट स्वीकार कर सकते हैं या टिप्पणी के साथ लौटा सकते हैं। सुधार माँगे जाने पर विज़िट खोलें, सुधारें और दोबारा भेजें।",
      },
      tip: {
        en: demo
          ? "Review is read-only in this demo. A visit’s review status is separate from whether it has synced."
          : "Surveyors can see this queue. Review decisions are reserved for assigned supervisors and project admins.",
        hi: demo
          ? "इस डेमो में समीक्षा केवल देख सकते हैं। विज़िट की समीक्षा स्थिति और उसकी सिंक स्थिति अलग हैं।"
          : "सर्वेक्षक यह कतार देख सकते हैं। समीक्षा के निर्णय केवल नियुक्त पर्यवेक्षक और परियोजना एडमिन लेते हैं।",
      },
    },
    finish,
  ];
}

export function ProductTour({
  identityId,
  demo,
  lang,
  ready,
  hasProject,
  farmerId,
  autoStart,
}: {
  identityId: string;
  demo: boolean;
  lang: Lang;
  ready: boolean;
  hasProject: boolean;
  farmerId?: string;
  autoStart: boolean;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const seen = useRef(new Set<string>());
  const storageKey = `fieldwork-tour-v1:${identityId}:${hasProject ? "workspace" : "setup"}`;
  const step = session?.steps[session.index];
  const text = (copy: Copy) => copy[lang];

  function launch() {
    setSession({
      index: 0,
      hash: window.location.hash,
      scrollY: window.scrollY,
      stayOnPage: window.location.hash.startsWith("#entry/"),
      steps: stepsFor(hasProject, farmerId, demo),
    });
  }
  useEffect(() => {
    if (!ready || !autoStart || session || seen.current.has(storageKey)) return;
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch {
      /* Tour still works when preferences cannot be stored. */
    }
    seen.current.add(storageKey);
    launch();
  }, [ready, autoStart, storageKey]);

  function route(hash: string) {
    if (window.location.hash === hash) return;
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}${hash}`,
    );
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
  function close(completed = false, explore = false) {
    if (!session) return;
    seen.current.add(storageKey);
    try {
      localStorage.setItem(storageKey, completed ? "completed" : "dismissed");
    } catch {
      /* The current session still remembers dismissal. */
    }
    if (explore && !session.stayOnPage) {
      route(hasProject ? "#farmers" : session.hash);
      window.scrollTo(0, 0);
    } else {
      route(session.hash);
      const scrollY = session.scrollY;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => window.scrollTo(0, scrollY)),
      );
    }
    setSession(null);
    setSpotlight(null);
  }
  function move(index: number) {
    if (!session) return;
    setSpotlight(null);
    const next = session.steps[index];
    if (next.route && !session.stayOnPage) route(`#${next.route}`);
    setSession({ ...session, index });
  }

  useEffect(() => {
    if (!step || !session) return;
    title.current?.focus({ preventScroll: true });
    if (!step.target || session.stayOnPage) {
      setSpotlight(null);
      return;
    }
    let frame = 0;
    let target: HTMLElement | null = null;
    const measure = () => {
      const next = document.querySelector<HTMLElement>(
        `[data-tour="${step.target}"]`,
      );
      if (!next) {
        setSpotlight(null);
        return;
      }
      if (next !== target) {
        target = next;
        const top = next.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, top - 100), behavior: "instant" });
      }
      const bounds = next.getBoundingClientRect();
      const mobile = window.innerWidth <= 800;
      const bottom = mobile
        ? (card.current?.getBoundingClientRect().top ?? window.innerHeight) - 20
        : window.innerHeight - 16;
      const top = Math.max(16, bounds.top - 6);
      const left = Math.max(12, bounds.left - 6);
      const width = Math.min(
        window.innerWidth - left - 12,
        bounds.right + 6 - left,
      );
      const height = Math.min(bottom, bounds.bottom + 6) - top;
      setSpotlight(
        width > 0 && height > 24 ? { top, left, width, height } : null,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.querySelector(".main-content")!, {
      childList: true,
      subtree: true,
    });
    const resize = new ResizeObserver(schedule);
    if (card.current) resize.observe(card.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [step, session?.stayOnPage, lang]);

  const intro = step?.id === "welcome";
  const finished = step?.id === "finish";
  const Icon = step?.icon ?? Leaf;
  return (
    <Dialog.Root
      open={!!session}
      onOpenChange={(open) => {
        if (open) launch();
        else close();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className="tour-trigger"
          disabled={!ready}
          aria-label={lang === "hi" ? "ऐप का परिचय" : "Take a tour"}
          title={lang === "hi" ? "ऐप का परिचय" : "Take a tour"}
        >
          <CircleHelp size={17} />
          <span>{lang === "hi" ? "ऐप का परिचय" : "Take a tour"}</span>
        </button>
      </Dialog.Trigger>
      {session && step && (
        <Dialog.Portal>
          <Dialog.Overlay
            className={`tour-backdrop ${spotlight ? "has-spotlight" : ""}`}
          >
            {spotlight && <div className="tour-spotlight" style={spotlight} />}
          </Dialog.Overlay>
          <Dialog.Content
            ref={card}
            className={`tour-card ${intro || finished ? "tour-card-centered" : ""}`}
            data-tour-step={step.id}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              title.current?.focus();
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" && !finished) {
                event.preventDefault();
                move(session.index + 1);
              }
              if (event.key === "ArrowLeft" && session.index > 0) {
                event.preventDefault();
                move(session.index - 1);
              }
            }}
          >
            <div className="tour-topline">
              <span>
                <Leaf size={15} />{" "}
                {lang === "hi"
                  ? "FIELDWORK · परिचय"
                  : "FIELDWORK · FIELD GUIDE"}
              </span>
              <Dialog.Close
                className="btn btn-ghost btn-icon"
                aria-label={lang === "hi" ? "परिचय बंद करें" : "Close tour"}
              >
                <X size={19} />
              </Dialog.Close>
            </div>
            {!intro && !finished && (
              <div
                className="tour-progress"
                aria-label={
                  lang === "hi"
                    ? `चरण ${session.index}, कुल ${session.steps.length - 2}`
                    : `Step ${session.index} of ${session.steps.length - 2}`
                }
              >
                {session.steps.slice(1, -1).map((s, i) => (
                  <span
                    key={s.id}
                    className={i < session.index ? "is-complete" : ""}
                  />
                ))}
              </div>
            )}
            <div className="tour-copy">
              <span
                className={`tour-icon ${finished ? "tour-icon-complete" : ""}`}
              >
                <Icon size={26} />
              </span>
              <p className="tour-eyebrow">{text(step.label)}</p>
              <Dialog.Title ref={title} tabIndex={-1}>
                {text(step.title)}
              </Dialog.Title>
              <Dialog.Description className="tour-description">
                {text(step.body)}
              </Dialog.Description>
              {intro && (
                <ol className="tour-workflow">
                  <li>
                    <Users size={18} />
                    <span>
                      {lang === "hi" ? "किसान पहचानें" : "Know the farmer"}
                    </span>
                  </li>
                  <li>
                    <FileText size={18} />
                    <span>
                      {lang === "hi"
                        ? "हर विज़िट दर्ज करें"
                        : "Record each visit"}
                    </span>
                  </li>
                  <li>
                    <ClipboardCheck size={18} />
                    <span>
                      {lang === "hi" ? "सिंक और समीक्षा करें" : "Sync & review"}
                    </span>
                  </li>
                </ol>
              )}
              {finished && hasProject && (
                <ul className="tour-checklist">
                  <li>
                    <Check size={16} />
                    {lang === "hi"
                      ? "किसान खोलें और उसकी टाइमलाइन देखें।"
                      : "Open a farmer and explore their timeline."}
                  </li>
                  <li>
                    <Check size={16} />
                    {lang === "hi"
                      ? "सर्वेक्षकों के लिए: चरण चुनें और नई विज़िट शुरू करें।"
                      : "Surveyors: choose a stage and start a new visit."}
                  </li>
                  <li>
                    <Check size={16} />
                    {lang === "hi"
                      ? "सिंक स्थिति और समीक्षा स्थिति अलग से जाँचें।"
                      : "Check sync status and review status separately."}
                  </li>
                </ul>
              )}
              <div className="tour-tip">
                <span>{text(step.tip)}</span>
              </div>
              {session.stayOnPage && (
                <p className="tour-stay-note">
                  {lang === "hi"
                    ? "परिचय पढ़ते समय आपकी विज़िट खुली रहेगी।"
                    : "Your visit stays open while you read the guide."}
                </p>
              )}
            </div>
            <div className="tour-footer">
              {intro ? (
                <button className="tour-skip" onClick={() => close()}>
                  {lang === "hi" ? "अभी छोड़ें" : "Skip for now"}
                </button>
              ) : (
                <Button variant="ghost" onClick={() => move(session.index - 1)}>
                  <ArrowLeft size={16} />
                  {lang === "hi" ? "पीछे" : "Back"}
                </Button>
              )}
              <Button
                onClick={() =>
                  finished ? close(true, true) : move(session.index + 1)
                }
              >
                {intro
                  ? lang === "hi"
                    ? "परिचय शुरू करें"
                    : "Show me around"
                  : finished
                    ? session.stayOnPage
                      ? lang === "hi"
                        ? "विज़िट पर लौटें"
                        : "Return to your visit"
                      : hasProject
                        ? lang === "hi"
                          ? "किसान देखें"
                          : "Explore farmers"
                        : lang === "hi"
                          ? "परियोजना चुनें"
                          : "Choose a project"
                    : lang === "hi"
                      ? "आगे"
                      : "Next"}
                <ArrowRight size={16} />
              </Button>
            </div>
            {intro && (
              <p className="tour-footnote">
                {lang === "hi"
                  ? "अपनी गति से देखें · कभी भी छोड़ें या दोबारा चलाएँ"
                  : "Go at your own pace · skip or replay anytime"}
              </p>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}
