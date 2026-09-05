(() => {
  const DEFAULTS = {
    language: 'zh',
    widthMode: 'medium', customWidth: 1400,
    backgroundMode: 'default', customTone: '#f6f8fb',
    fontSize: 16, lineHeight: 1.72,
    messageEmphasis: false, messageStyle: 'soft', messageAccent: '#2f64ff', messageStrength: 45,
    codeWrap: true, popupDark: false, navigatorEnabled: true,
    exportMode: 'current', exportScope: 'all', exportStart: 1, exportEnd: 999,
    exportIncludeMeta: true, exportIncludeImages: true
  };
  const STORAGE_AREA = chrome.storage.sync;
  const NAV_ID = 'gpt-view-plus-navigator';
  const SCAN_STATUS_ID = 'gpt-view-plus-scan-status';
  const STYLE_ID = 'gpt-view-plus-style';
  const BOOKMARK_KEY = 'gptViewBookmarksV053';
  const NAV_LAYOUT_KEY = 'gptViewNavigatorLayoutV053';
  let settings = { ...DEFAULTS };
  let styleEl;
  let navHost = null;
  let navShadow = null;
  let navOpen = false;
  let navMode = 'outline';
  let searchRole = 'all';
  let currentQuestion = 0;
  let bookmarks = new Set();
  let navLayout = null;
  let refreshTimer = null;
  let scanBusy = false;
  let scanPaused = false;
  let scanCancelRequested = false;
  let scanStatusHost = null;
  let scanProgressValue = -1;
  let toastTimer = null;
  let scrollRaf = 0;
  let messageCache = new Map();
  let lastFullScanKey = '';
  let lastFullScanSnapshot = null;
  let activeScanConversationKey = '';
  let activeScanSeenKeys = null;
  let lastPath = location.pathname;
  let navResizeObserver = null;
  let floatingRepairTimer = null;

  const widthMap = { narrow: 860, medium: 1120, wide: 1360 };
  const NAV_TEXT={
    zh:{title:'长对话导航',questions:'问',messages:'条消息',searchPh:'搜索当前对话…',outline:'问题目录',search:'搜索',bookmarks:'书签',fullScan:'完整扫描',scanVirtual:'扫描虚拟化长对话',all:'全部',you:'你',gpt:'GPT',shortcut:'Alt + Shift + N 打开 · / 搜索 · Esc 关闭 · ⠿ 拖动',drag:'拖动导航',prev:'上一个问题',openOutline:'打开目录',next:'下一个问题',openNav:'打开长对话导航',current:'当前',image:'包含图片',unloaded:'未加载内容',imageAlt:'消息图片',unbookmark:'取消收藏',bookmark:'收藏',noQuestions:'当前还没有可导航的问题',noBookmarks:'还没有书签，点击 ☆ 收藏重要问题或回答',searchHint:'输入关键词搜索当前对话',noMatches:'没有找到匹配内容',notLoaded:'该消息暂未加载，可先执行完整扫描',scanBottom:'正在前往对话底部…',bottomReached:'已到达对话底部 · 正在加载完整历史…',scanTop:'正在确认最早消息…',scanSweep:'正在扫描全部聊天内容…',scanComplete:n=>`完整扫描完成 · 已到达对话底部 · 共识别 ${n} 条消息`,scanPartial:n=>`扫描结束 · 共识别 ${n} 条消息，但未能确认完整到达对话底部`,scanEnded:'扫描已结束',scanPaused:'扫描已暂停',scanResume:'继续扫描',scanPause:'暂停扫描',scanStop:'结束扫描',scanning:'扫描中…',processed:n=>`已处理 ${n} 条消息`,source:'来源',emptyText:'（无文本内容）'},
    en:{title:'Long-chat navigator',questions:'questions',messages:'messages',searchPh:'Search this conversation…',outline:'Outline',search:'Search',bookmarks:'Bookmarks',fullScan:'Full scan',scanVirtual:'Scan virtualized long conversation',all:'All',you:'You',gpt:'GPT',shortcut:'Alt + Shift + N open · / search · Esc close · ⠿ drag',drag:'Drag navigator',prev:'Previous prompt',openOutline:'Open outline',next:'Next prompt',openNav:'Open long-chat navigator',current:'Current',image:'Contains image',unloaded:'Content not loaded',imageAlt:'Message image',unbookmark:'Remove bookmark',bookmark:'Bookmark',noQuestions:'No prompts available yet',noBookmarks:'No bookmarks yet. Click ☆ to save an important prompt or reply.',searchHint:'Type a keyword to search this conversation',noMatches:'No matches found',notLoaded:'This message is not loaded yet. Run a full scan first.',scanBottom:'Going to the bottom of the conversation…',bottomReached:'Bottom reached · loading full history…',scanTop:'Confirming the earliest messages…',scanSweep:'Scanning the complete conversation…',scanComplete:n=>`Full scan complete · bottom reached · ${n} messages identified`,scanPartial:n=>`Scan ended · ${n} messages identified, but the bottom could not be fully verified`,scanEnded:'Scan ended',scanPaused:'Scan paused',scanResume:'Resume scan',scanPause:'Pause scan',scanStop:'Stop scan',scanning:'Scanning…',processed:n=>`Processed ${n} messages`,source:'Source',emptyText:'(No text content)'}
  };
  function nt(key,...args){const v=(NAV_TEXT[settings.language]||NAV_TEXT.zh)[key];return typeof v==='function'?v(...args):(v||key);}

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function syncSet(values){return new Promise((resolve,reject)=>STORAGE_AREA.set(values,()=>{const err=chrome.runtime.lastError;err?reject(new Error(err.message||'SYNC_STORAGE_WRITE_FAILED')):resolve();}));}
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || min));
  function alpha(hex, a) {
    const h = String(hex || '#2f64ff').replace('#', '');
    const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6,'0').slice(0,6);
    const r = parseInt(n.slice(0,2),16), g = parseInt(n.slice(2,4),16), b = parseInt(n.slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function rgb(hex) {
    const h=String(hex||'#f6f8fb').replace('#',''); const n=h.length===3?h.split('').map(c=>c+c).join(''):h.padEnd(6,'0').slice(0,6);
    return [parseInt(n.slice(0,2),16),parseInt(n.slice(2,4),16),parseInt(n.slice(4,6),16)];
  }
  function isDarkColor(hex){const [r,g,b]=rgb(hex);return (0.2126*r+0.7152*g+0.0722*b)<135;}
  function toHex(n){return Math.round(Math.min(255,Math.max(0,n))).toString(16).padStart(2,'0');}
  function mixHex(hex,target,amount){const a=rgb(hex),b=rgb(target);return '#'+a.map((v,i)=>toHex(v+(b[i]-v)*amount)).join('');}
  function relativeLuminance(hex){const [r,g,b]=rgb(hex).map(v=>{const c=v/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);});return .2126*r+.7152*g+.0722*b;}
  function contrastRatio(a,b){const x=relativeLuminance(a),y=relativeLuminance(b),hi=Math.max(x,y),lo=Math.min(x,y);return (hi+.05)/(lo+.05);}
  function contrastText(hex){const light='#f9fafb',dark='#111827',lr=contrastRatio(hex,light),dr=contrastRatio(hex,dark);if(Math.max(lr,dr)>=4.5)return lr>=dr?light:dark;return contrastRatio(hex,'#ffffff')>=contrastRatio(hex,'#000000')?'#ffffff':'#000000';}
  function resolvedWidth(){return settings.widthMode==='custom'?clamp(settings.customWidth,900,1500):widthMap[settings.widthMode]||widthMap.medium;}
  function themeValues(){
    if(settings.backgroundMode==='default') return null;
    let main='#f6f8fb';
    if(settings.backgroundMode==='warm') main='#faf7ee';
    else if(settings.backgroundMode==='soft') main='#f3f5f8';
    else if(settings.backgroundMode==='dark') main='#202123';
    else if(settings.backgroundMode==='custom') main=settings.customTone||'#f6f8fb';
    const dark=settings.backgroundMode==='dark'||isDarkColor(main);
    const side=dark?mixHex(main,'#000000',.16):mixHex(main,'#000000',.055);
    const secondary=dark?mixHex(main,'#ffffff',.10):mixHex(main,'#ffffff',.55);
    const tertiary=dark?mixHex(main,'#ffffff',.16):mixHex(main,'#000000',.025);
    const text=contrastText(main);
    const text2=text==='#f9fafb'?mixHex(text,main,.24):mixHex(text,main,.18);
    const border=dark?mixHex(main,'#ffffff',.22):mixHex(main,'#000000',.12);
    const link=dark?'#8ab4ff':'#1f5fd6';
    const mediaBg=dark?'#f1f3f5':'transparent';
    return {main,side,secondary,tertiary,text,text2,border,link,mediaBg,dark};
  }
  function nativePageDark(){if(document.documentElement.classList.contains('dark'))return true;try{const c=getComputedStyle(document.body).backgroundColor,m=c.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);if(m){const hex='#'+[m[1],m[2],m[3]].map(v=>toHex(Number(v))).join('');return isDarkColor(hex);}}catch(_){}return false;}
  function navigatorUsesDark(){const theme=themeValues();return theme?theme.dark:nativePageDark();}
  function syncNavigatorTheme(){const root=navShadow?.getElementById('root');if(root)root.classList.toggle('theme-dark',navigatorUsesDark());}

  function rememberInlineStyle(node){
    if(!(node instanceof Element)||node.hasAttribute('data-gv-style-snapshot'))return;
    const original=node.getAttribute('style');
    node.setAttribute('data-gv-style-snapshot',original===null?'__GV_NONE__':original);
  }
  function restoreSelectionToolbarStyles(){
    document.querySelectorAll('[data-gv-style-snapshot]').forEach(node=>{
      const original=node.getAttribute('data-gv-style-snapshot');
      if(original==='__GV_NONE__')node.removeAttribute('style');else node.setAttribute('style',original||'');
      node.removeAttribute('data-gv-style-snapshot');
      node.removeAttribute('data-gv-format-toolbar');
      node.removeAttribute('data-gv-format-surface');
    });
  }
  function forceSelectionToolbar(surface){
    if(!surface||!(surface instanceof Element))return;
    rememberInlineStyle(surface);surface.setAttribute('data-gv-format-toolbar','1');surface.setAttribute('data-gv-format-surface','1');
    const rootStyle=surface.style;rootStyle.setProperty('background','#ffffff','important');rootStyle.setProperty('background-color','#ffffff','important');rootStyle.setProperty('color','#111827','important');rootStyle.setProperty('-webkit-text-fill-color','#111827','important');rootStyle.setProperty('border-color','#d1d5db','important');rootStyle.setProperty('opacity','1','important');rootStyle.setProperty('filter','none','important');rootStyle.setProperty('mix-blend-mode','normal','important');rootStyle.setProperty('color-scheme','light','important');
    surface.querySelectorAll('button,[role="button"],span,div,svg,path,i,b,strong,em').forEach(n=>{rememberInlineStyle(n);const disabled=n.closest?.('button:disabled,[aria-disabled="true"]');const color=disabled?'#6b7280':'#111827';n.style?.setProperty('color',color,'important');n.style?.setProperty('-webkit-text-fill-color',color,'important');n.style?.setProperty('opacity','1','important');n.style?.setProperty('filter','none','important');if(n instanceof SVGElement)n.style.setProperty('stroke','currentColor','important');});
  }
  function selectionBounds(){
    const sel=window.getSelection?.();if(!sel||sel.isCollapsed||!String(sel).trim())return null;
    try{const range=sel.getRangeAt(0),rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);if(!rects.length)return null;const left=Math.min(...rects.map(r=>r.left)),right=Math.max(...rects.map(r=>r.right)),top=Math.min(...rects.map(r=>r.top)),bottom=Math.max(...rects.map(r=>r.bottom));return {left,right,top,bottom,cx:(left+right)/2,cy:(top+bottom)/2};}catch(_){return null;}
  }
  function nearSelection(node,bounds,maxDistance=220){if(!bounds||!node)return false;const r=node.getBoundingClientRect();if(r.width<1||r.height<1)return false;const cx=Math.max(r.left,Math.min(bounds.cx,r.right)),cy=Math.max(r.top,Math.min(bounds.cy,r.bottom));return Math.hypot(cx-bounds.cx,cy-bounds.cy)<=maxDistance;}
  function repairFloatingControls(){
    const bounds=selectionBounds();restoreSelectionToolbarStyles();if(!bounds)return;
    const candidates=new Set();
    const known='[role="toolbar"],[data-slot*="popover"],[data-testid*="selection"],[data-testid*="format"]';
    document.querySelectorAll(known).forEach(root=>{const r=root.getBoundingClientRect();if(r.width>=90&&r.width<=680&&r.height>=24&&r.height<=150&&nearSelection(root,bounds,260))candidates.add(root);});
    document.querySelectorAll('button,[role="button"]').forEach(button=>{const br=button.getBoundingClientRect();if(br.width<1||br.height<1||!nearSelection(button,bounds,240))return;let node=button.parentElement;for(let depth=0;node&&depth<4&&node!==document.body;depth++,node=node.parentElement){const r=node.getBoundingClientRect();if(r.width<90||r.width>680||r.height<24||r.height>145||!nearSelection(node,bounds,240))continue;const buttons=[...node.querySelectorAll('button,[role="button"]')].filter(b=>{const x=b.getBoundingClientRect();return x.width>0&&x.height>0;});if(buttons.length<2||buttons.length>10)continue;const labels=buttons.map(b=>`${b.textContent||''} ${b.getAttribute('aria-label')||''} ${b.getAttribute('title')||''}`).join(' ').toLowerCase();if(/文本|text|link|链接|bold|粗体|italic|斜体|format|格式/.test(labels))candidates.add(node);}});
    candidates.forEach(root=>{const r=root.getBoundingClientRect();if(r.width>680||r.height>150||!nearSelection(root,bounds,260))return;const buttons=[...root.querySelectorAll('button,[role="button"]')].filter(b=>{const x=b.getBoundingClientRect();return x.width>0&&x.height>0;});if(buttons.length<2||buttons.length>12)return;const labels=buttons.map(b=>`${b.textContent||''} ${b.getAttribute('aria-label')||''} ${b.getAttribute('title')||''}`).join(' ').toLowerCase();if(!/文本|text|link|链接|bold|粗体|italic|斜体|format|格式/.test(labels))return;let surface=root.matches?.('[role="toolbar"],[data-slot*="popover"]')?root:root.querySelector?.('[role="toolbar"],[data-slot*="popover-content"]');if(!surface)surface=root;forceSelectionToolbar(surface);});
  }
  function injectStyles() {
    if (!styleEl) { styleEl=document.createElement('style'); styleEl.id=STYLE_ID; document.documentElement.appendChild(styleEl); }
    const width=`${resolvedWidth()}px`, accent=settings.messageAccent, k=clamp(settings.messageStrength,15,100,45)/100;
    const theme=themeValues();
    const themeCss=theme?`
      :root,html,body{--main-surface-primary:${theme.main}!important;--main-surface-secondary:${theme.secondary}!important;--main-surface-tertiary:${theme.tertiary}!important;--sidebar-surface-primary:${theme.side}!important;--sidebar-surface-secondary:${theme.side}!important;--sidebar-surface-tertiary:${theme.tertiary}!important;--message-surface:${theme.secondary}!important;--message-surface-hover:${theme.tertiary}!important;--composer-surface:${theme.secondary}!important;--composer-surface-primary:${theme.secondary}!important;--composer-surface-secondary:${theme.tertiary}!important;--text-primary:${theme.text}!important;--text-secondary:${theme.text2}!important;--text-tertiary:${theme.text2}!important;--border-light:${theme.border}!important;--border-medium:${theme.border}!important;}
      html,body,#root,#__next,main{background-color:${theme.main}!important;color:${theme.text}!important;}
      main,[class*="bg-token-main-surface-primary"],[class*="bg-token-main-surface-secondary"],[class*="bg-token-main-surface-tertiary"]{background-color:${theme.main}!important;color:${theme.text}!important;}
      [class*="bg-token-sidebar-surface-primary"],[class*="bg-token-sidebar-surface-secondary"],[class*="bg-token-sidebar-surface-tertiary"],[data-testid*="sidebar"]{background-color:${theme.side}!important;color:${theme.text}!important;}
      [class*="bg-token-sidebar-surface-primary"] :where(a,button,span),[class*="bg-token-sidebar-surface-secondary"] :where(a,button,span),[data-testid*="sidebar"] :where(a,button,span){color:inherit!important;}
      main [class*="text-token-text-primary"],[class*="bg-token-sidebar-surface"] [class*="text-token-text-primary"],[data-testid*="sidebar"] [class*="text-token-text-primary"],main [data-message-author-role],main .prose{color:${theme.text}!important;}main [class*="text-token-text-secondary"],main [class*="text-token-text-tertiary"],[class*="bg-token-sidebar-surface"] [class*="text-token-text-secondary"],[class*="bg-token-sidebar-surface"] [class*="text-token-text-tertiary"],[data-testid*="sidebar"] [class*="text-token-text-secondary"],[data-testid*="sidebar"] [class*="text-token-text-tertiary"]{color:${theme.text2}!important;}
      [data-message-author-role="assistant"] .prose :where(p,li,h1,h2,h3,h4,h5,h6,strong,em,blockquote,td,th,figcaption){color:${theme.text}!important;}
      [data-message-author-role="assistant"] .prose a{color:${theme.link}!important;} [data-message-author-role="assistant"] .prose :where(p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th) span{color:inherit!important;} [data-message-author-role="assistant"] .prose [style*="color"]{color:${theme.text}!important;}
      [data-message-author-role="user"] .user-message-bubble-color,[data-message-author-role="user"] [class*="bg-token-message-surface"]{background-color:${theme.secondary}!important;color:${theme.text}!important;}
      [data-message-author-role="user"] .user-message-bubble-color *,[data-message-author-role="user"] [class*="bg-token-message-surface"] *{color:inherit!important;}
      #prompt-textarea,#prompt-textarea *,main form:has(#prompt-textarea) textarea,main form:has(#prompt-textarea) input:not([type="range"]),main form:has(#prompt-textarea) [contenteditable="true"],main [data-testid="composer"] textarea,main [data-testid="composer"] input:not([type="range"]),main [data-testid="composer"] [contenteditable="true"]{color:${theme.text}!important;caret-color:${theme.text}!important;}
      #prompt-textarea[data-placeholder]::before,main form:has(#prompt-textarea) [contenteditable="true"][data-placeholder]::before,main form:has(#prompt-textarea) textarea::placeholder,main form:has(#prompt-textarea) input::placeholder,main [data-testid="composer"] [contenteditable="true"][data-placeholder]::before,main [data-testid="composer"] textarea::placeholder,main [data-testid="composer"] input::placeholder{color:${theme.text2}!important;opacity:.86!important;}
      main form:has(#prompt-textarea),main form:has(#prompt-textarea)>div,main form:has(#prompt-textarea) [class*="bg-token-main-surface"],main [data-testid="composer"],main [data-testid="composer"]>div{background-color:${theme.secondary}!important;border-color:${theme.border}!important;color:${theme.text}!important;}
      main form:has(#prompt-textarea) button:not([data-testid*="send"]):not([aria-label*="发送"]):not([aria-label*="Send"]):not([class*="bg-primary"]),main [data-testid="composer"] button:not([data-testid*="send"]):not([aria-label*="发送"]):not([aria-label*="Send"]):not([class*="bg-primary"]){color:${theme.text}!important;}
      main form:has(#prompt-textarea) button:not([data-testid*="send"]):not([aria-label*="发送"]):not([aria-label*="Send"]) :where(svg,path),main [data-testid="composer"] button:not([data-testid*="send"]):not([aria-label*="发送"]):not([aria-label*="Send"]) :where(svg,path){color:inherit!important;stroke:currentColor!important;}
      main form:has(#prompt-textarea) button[data-testid*="send"],main form:has(#prompt-textarea) button[aria-label*="发送"],main form:has(#prompt-textarea) button[aria-label*="Send"],main form:has(#prompt-textarea) button[class*="bg-primary"],main [data-testid="composer"] button[data-testid*="send"],main [data-testid="composer"] button[class*="bg-primary"]{color:#ffffff!important;}
      main form:has(#prompt-textarea) button[data-testid*="send"] *,main form:has(#prompt-textarea) button[aria-label*="发送"] *,main form:has(#prompt-textarea) button[aria-label*="Send"] *,main form:has(#prompt-textarea) button[class*="bg-primary"] *{color:#ffffff!important;stroke:currentColor!important;}
      [role="tooltip"],[data-slot="tooltip-content"],[data-radix-popper-content-wrapper] [role="tooltip"]{background:#111827!important;color:#f9fafb!important;border-color:#374151!important;overflow:visible!important;white-space:nowrap!important;max-width:none!important;}
      [role="tooltip"] *,[data-slot="tooltip-content"] *,[data-radix-popper-content-wrapper] [role="tooltip"] *{color:#f9fafb!important;-webkit-text-fill-color:#f9fafb!important;opacity:1!important;}
      [role="tooltip"] kbd,[data-slot="tooltip-content"] kbd,[data-radix-popper-content-wrapper] kbd{background:#374151!important;border:1px solid #4b5563!important;color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;opacity:1!important;}
      main form:has(#prompt-textarea) [class*="text-token-text-secondary"],main form:has(#prompt-textarea) [class*="text-token-text-tertiary"],main [data-testid="composer"] [class*="text-token-text-secondary"],main [data-testid="composer"] [class*="text-token-text-tertiary"]{color:${theme.text2}!important;}
      main pre,main pre code{background-color:${theme.tertiary}!important;color:${theme.text}!important;border-color:${theme.border}!important;}
      ${theme.dark?`main pre code *{color:inherit!important;} [data-message-author-role] img:not([class*="avatar"]):not([data-testid*="avatar"]){background-color:${theme.mediaBg}!important;}`:''}
      hr,[class*="border-token"],[class*="border-color"]{border-color:${theme.border}!important;}
    `:'';
    let bubbleCss='';
    if(settings.messageEmphasis){
      if(settings.messageStyle==='outline') bubbleCss=`background:transparent!important;border:1px solid ${alpha(accent,.26+.62*k)}!important;box-shadow:none!important;`;
      else if(settings.messageStyle==='card') bubbleCss=`background:linear-gradient(135deg,${alpha(accent,.07+.26*k)},${alpha(accent,.025+.10*k)})!important;border:0!important;box-shadow:0 8px 22px ${alpha(accent,.045+.14*k)}!important;`;
      else bubbleCss=`background:${alpha(accent,.06+.30*k)}!important;border:0!important;box-shadow:none!important;`;
    }
    const overlayCss=`
      [role="tooltip"],[data-slot="tooltip-content"]{background:#111827!important;color:#f9fafb!important;border-color:#374151!important;overflow:visible!important;white-space:nowrap!important;max-width:none!important;}
      [role="tooltip"] *,[data-slot="tooltip-content"] *{color:#f9fafb!important;-webkit-text-fill-color:#f9fafb!important;opacity:1!important;}
      [role="tooltip"] kbd,[data-slot="tooltip-content"] kbd{background:#374151!important;border:1px solid #4b5563!important;color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;opacity:1!important;}
      [data-gv-format-toolbar="1"]{color-scheme:light!important;opacity:1!important;filter:none!important;}
      [data-gv-format-surface="1"]{background:#ffffff!important;color:#111827!important;-webkit-text-fill-color:#111827!important;border:1px solid #d1d5db!important;box-shadow:0 10px 30px rgba(0,0,0,.18)!important;opacity:1!important;}
      [data-gv-format-toolbar="1"] :where(button,button *,span,div,svg,path){color:#111827!important;-webkit-text-fill-color:#111827!important;stroke:currentColor!important;opacity:1!important;filter:none!important;}
      [data-gv-format-toolbar="1"] :where(button:disabled,[aria-disabled="true"],button:disabled *,[aria-disabled="true"] *){color:#6b7280!important;-webkit-text-fill-color:#6b7280!important;opacity:1!important;}
      [role="listbox"] input[type="range"],[role="menu"] input[type="range"],[data-radix-popper-content-wrapper] input[type="range"],[data-floating-ui-portal] input[type="range"]{color:initial!important;-webkit-text-fill-color:initial!important;accent-color:auto!important;filter:none!important;mix-blend-mode:normal!important;}
    `;
    const userSelectors='[data-message-author-role="user"] .user-message-bubble-color,[data-message-author-role="user"] [class*="bg-token-message-surface"]:not(:has(.user-message-bubble-color))';
    const messageCss=settings.messageEmphasis?`
      ${userSelectors}{${bubbleCss}${theme?`color:${theme.text}!important;`:''}}
    `:'';
    const css=`
      :root{--gv-width:${width}!important;--gv-font:${clamp(settings.fontSize,14,22,16)}px;--gv-line:${clamp(settings.lineHeight,1.35,2.1,1.72)};--thread-content-max-width:var(--gv-width)!important;--thread-content-width:var(--gv-width)!important;}
      ${themeCss}
      ${overlayCss}
      #thread [class*="thread-content-max-width"],#thread [style*="--thread-content-max-width"]{--thread-content-max-width:var(--gv-width)!important;--thread-content-width:var(--gv-width)!important;width:min(100%,var(--gv-width))!important;max-width:var(--gv-width)!important;margin-left:auto!important;margin-right:auto!important;}
      main form:has(#prompt-textarea),main [data-testid="composer"]{width:min(100%,var(--gv-width))!important;max-width:var(--gv-width)!important;margin-left:auto!important;margin-right:auto!important;}
      [data-message-author-role="assistant"] .prose,[data-message-author-role="assistant"] [class*="prose"]{font-size:var(--gv-font)!important;line-height:var(--gv-line)!important;}
      [data-message-author-role] img:not([class*="avatar"]):not([data-testid*="avatar"]){width:auto!important;height:auto!important;max-width:min(100%,760px)!important;max-height:72vh!important;object-fit:contain!important;}
      [data-message-author-role] picture,[data-message-author-role] figure,[data-message-author-role] [class*="imagegen"],[data-message-author-role] video{max-width:min(100%,820px)!important;height:auto!important;}
      [data-message-author-role="assistant"] pre,[data-message-author-role="assistant"] code{white-space:${settings.codeWrap?'pre-wrap':'pre'}!important;word-break:${settings.codeWrap?'break-word':'normal'}!important;}
      ${messageCss}
    `;
    if(styleEl.textContent!==css) styleEl.textContent=css; syncNavigatorTheme(); setTimeout(repairFloatingControls,0);
  }

  function conversationKey() { return `${location.origin}${location.pathname}`; }
  function hashText(value){let h=2166136261;const str=String(value||'');for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
  function recordValidationSignature(role,text,image){return `${role}|${hashText(text)}|${String(image||'')}`;}
  function cacheValidationSnapshot(){const snapshot=new Map();for(const [key,r] of messageCache.entries())snapshot.set(key,recordValidationSignature(r.role,r.text,r.image));return snapshot;}
  function mountedMatchesSnapshot(snapshot=lastFullScanSnapshot){if(!snapshot||!snapshot.size)return false;const shells=turnShells();let seen=0;for(let index=0;index<shells.length;index++){const shell=shells[index],role=roleOf(shell);if(role!=='user'&&role!=='assistant')continue;const key=keyOf(shell,index),text=textOf(shell,role),image=imageOf(shell,role);if(!text&&!image)continue;seen++;if(!snapshot.has(key)||snapshot.get(key)!==recordValidationSignature(role,text,image))return false;}return seen>0;}
  function fullScanStillValid(){return !!lastFullScanKey&&lastFullScanKey===conversationKey()&&mountedMatchesSnapshot(lastFullScanSnapshot);}
  function clearFullScanValidation(){lastFullScanKey='';lastFullScanSnapshot=null;}
  function syncRouteState(){if(location.pathname===lastPath)return false;lastPath=location.pathname;messageCache=new Map();clearFullScanValidation();bookmarks=new Set();loadLocalState().then(()=>{if(navShadow)refreshNavigator();}).catch(()=>{});return true;}
  function localGet(defaults) { return new Promise((resolve) => chrome.storage.local.get(defaults,(data)=>resolve(chrome.runtime.lastError?defaults:data))); }
  function localSet(values) { return new Promise((resolve,reject) => chrome.storage.local.set(values,()=>{const err=chrome.runtime.lastError;err?reject(new Error(err.message||'LOCAL_STORAGE_WRITE_FAILED')):resolve();})); }
  async function loadLocalState() {
    const key=conversationKey();
    const data = await localGet({ [BOOKMARK_KEY]: {}, [NAV_LAYOUT_KEY]: null });
    if(key!==conversationKey())return false;
    bookmarks = new Set(data[BOOKMARK_KEY]?.[key] || []);
    navLayout = data[NAV_LAYOUT_KEY] || null;
    return true;
  }
  async function saveBookmarks() {
    const key=conversationKey(),snapshot=[...bookmarks];
    const data = await localGet({ [BOOKMARK_KEY]: {} });
    const all = data[BOOKMARK_KEY] || {};
    all[key] = snapshot;
    await localSet({ [BOOKMARK_KEY]: all });
  }
  async function saveNavLayout() { try{await localSet({ [NAV_LAYOUT_KEY]: navLayout });return true;}catch(_){return false;} }

  function turnShells() {
    const shells = [...document.querySelectorAll('[data-testid^="conversation-turn-"]')];
    if (shells.length) return shells;
    return [...document.querySelectorAll('[data-message-author-role]')];
  }
  function roleOf(shell) {
    return shell.getAttribute('data-turn') || shell.getAttribute('data-message-author-role') || shell.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role') || '';
  }
  function keyOf(shell, index) {
    return shell.getAttribute('data-turn-id') || shell.getAttribute('data-testid') || shell.querySelector('[data-message-id]')?.getAttribute('data-message-id') || `${roleOf(shell)}-${index}`;
  }
  function orderOf(shell, index) {
    const testid = shell.getAttribute('data-testid') || '';
    const m = testid.match(/conversation-turn-(\d+)/);
    return m ? Number(m[1]) : index;
  }
  function roleNodeOf(shell,role){return shell.matches?.('[data-message-author-role]')?shell:shell.querySelector?.(`[data-message-author-role="${role}"]`)||null;}
  function contentNode(shell,role){
    const roleNode=roleNodeOf(shell,role); if(!roleNode)return null;
    if(role==='user') return roleNode.querySelector?.('[class*="whitespace-pre-wrap"]')||roleNode;
    return roleNode.querySelector?.('.markdown,.prose,[class*="markdown"],[class*="prose"]')||roleNode;
  }
  function richContentNode(shell,role){const roleNode=roleNodeOf(shell,role);if(!roleNode)return null;if(role==='user')return roleNode;return roleNode.querySelector?.('.markdown,.prose,[class*="markdown"],[class*="prose"]')||roleNode;}
  function textOf(shell,role){return (contentNode(shell,role)?.innerText||'').trim();}
  function imageOf(shell,role){const node=richContentNode(shell,role);if(!node)return'';const img=[...node.querySelectorAll('img')].find(x=>!String(x.className||'').includes('avatar')&&!String(x.getAttribute('data-testid')||'').includes('avatar'));if(!img)return'';const src=img.currentSrc||img.getAttribute('src')||'';if(!src)return'';try{return new URL(src,location.href).href;}catch(_){return src;}}
  function cleanClone(node){
    const clone=node.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,input,textarea,select,[data-testid*="copy"],[aria-label*="Copy"],[aria-label*="复制"]').forEach(n=>n.remove());
    clone.querySelectorAll('button').forEach(btn=>{if(btn.querySelector('img,picture,figure,video'))btn.replaceWith(...btn.childNodes);else btn.remove();});
    clone.querySelectorAll('*').forEach(el=>{[...el.attributes].forEach(attr=>{if(/^on/i.test(attr.name))el.removeAttribute(attr.name);});});
    clone.querySelectorAll('a[href]').forEach(a=>{const raw=a.getAttribute('href')||'';if(/^javascript:/i.test(raw)){a.removeAttribute('href');return;}try{a.href=new URL(raw,location.href).href;}catch(_){}});
    const originals=[...node.querySelectorAll('img')],images=[...clone.querySelectorAll('img')];images.forEach((img,i)=>{const original=originals[i],src=original?.currentSrc||original?.getAttribute('src')||img.getAttribute('src')||'';if(/^javascript:/i.test(src)){img.removeAttribute('src');return;}try{if(src)img.src=new URL(src,location.href).href;}catch(_){if(src)img.src=src;}img.removeAttribute('srcset');img.removeAttribute('sizes');img.loading='eager';img.decoding='sync';if(!img.getAttribute('alt'))img.setAttribute('alt',original?.getAttribute('alt')||nt('imageAlt'));});
    return clone;
  }
  function htmlOf(shell,role){const node=richContentNode(shell,role);return node?cleanClone(node).innerHTML:'';}
  function mdEscapeCell(v){return String(v||'').replace(/\|/g,'\\|').replace(/\n/g,'<br>').trim();}
  function domToMarkdown(node){if(!node)return'';if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||'';if(node.nodeType!==Node.ELEMENT_NODE)return'';const tag=node.tagName.toLowerCase(),kids=()=>[...node.childNodes].map(domToMarkdown).join('');if(tag==='pre'){const code=node.querySelector('code'),cls=String(code?.className||''),lang=(cls.match(/language-([\w+-]+)/)||[])[1]||'';return `\n\n\`\`\`${lang}\n${(code?.innerText||node.innerText||'').trim()}\n\`\`\`\n\n`;}if(tag==='code')return `\`${(node.innerText||'').replace(/`/g,'\\`').trim()}\``;if(/^h[1-6]$/.test(tag))return `\n\n${'#'.repeat(Number(tag[1]))} ${(node.innerText||'').trim()}\n\n`;if(tag==='strong'||tag==='b')return `**${kids()}**`;if(tag==='em'||tag==='i')return `*${kids()}*`;if(tag==='br')return'\n';if(tag==='hr')return'\n\n---\n\n';if(tag==='a'){const href=node.getAttribute('href')||'';return `[${kids().trim()||href}](${href})`;}if(tag==='img'){const src=node.getAttribute('src')||'',alt=node.getAttribute('alt')||'';return src?`![${alt}](${src})`:'';}if(tag==='p')return `${kids().trim()}\n\n`;if(tag==='blockquote')return `${kids().trim().split('\n').map(x=>`> ${x}`).join('\n')}\n\n`;if(tag==='ul'||tag==='ol'){let i=1;const lines=[...node.children].filter(x=>x.tagName?.toLowerCase()==='li').map(li=>`${tag==='ol'?`${i++}. `:'- '}${[...li.childNodes].map(domToMarkdown).join('').trim()}`);return `\n${lines.join('\n')}\n\n`;}if(tag==='table'){const rows=[...node.querySelectorAll('tr')].map(tr=>[...tr.children].filter(c=>/^(th|td)$/i.test(c.tagName)).map(c=>mdEscapeCell(c.innerText))).filter(r=>r.length);if(!rows.length)return'';const cols=Math.max(...rows.map(r=>r.length)),norm=r=>Array.from({length:cols},(_,i)=>r[i]||'');const out=[`| ${norm(rows[0]).join(' | ')} |`,`| ${Array(cols).fill('---').join(' | ')} |`];rows.slice(1).forEach(r=>out.push(`| ${norm(r).join(' | ')} |`));return `\n\n${out.join('\n')}\n\n`;}return kids();}
  function markdownOf(shell,role){const node=richContentNode(shell,role);if(!node)return'';const md=domToMarkdown(cleanClone(node)).replace(/\n{3,}/g,'\n\n').trim();return md||(node.innerText||'').trim();}
  function collectRecords(){syncRouteState();const shells=turnShells(),records=[];shells.forEach((shell,index)=>{const role=roleOf(shell);if(role!=='user'&&role!=='assistant')return;const key=keyOf(shell,index),testid=shell.getAttribute('data-testid')||'',order=orderOf(shell,index),text=textOf(shell,role),image=imageOf(shell,role),old=messageCache.get(key);if(activeScanSeenKeys&&(text||image))activeScanSeenKeys.add(key);if(testid){for(const [otherKey,other] of messageCache.entries()){if(otherKey!==key&&other.testid&&other.order===order&&other.role===role)messageCache.delete(otherKey);}}let html=old?.html||'',markdown=old?.markdown||'',cachedImage=image||old?.image||'';if((text||image)&&(!old||old.text!==text||image!==old.image||!html||!markdown)){html=htmlOf(shell,role);markdown=markdownOf(shell,role);}if(text||html||markdown||cachedImage)messageCache.set(key,{key,role,text:text||old?.text||'',html,markdown,image:cachedImage,order,testid,updatedAt:Date.now()});const cached=messageCache.get(key);records.push({key,role,text:text||cached?.text||'',html:html||cached?.html||'',markdown:markdown||cached?.markdown||'',image:cachedImage||cached?.image||'',shell,index,order,testid});});return records;}
  function withQuestionNumbers(records){let q=0;return records.map(r=>{if(r.role==='user')q++;return{...r,question:q||1};});}
  function allRecords(){const current=collectRecords(),seen=new Set(current.map(r=>r.key));for(const cached of messageCache.values())if(!seen.has(cached.key))current.push({...cached,shell:null,index:current.length});current.sort((a,b)=>(a.order??a.index??0)-(b.order??b.index??0));return withQuestionNumbers(current);}
  function userRecords(){return collectRecords().filter(r=>r.role==='user');}
  function fileName(ext){const raw=(document.title||'chatgpt').replace(/\s*-\s*ChatGPT.*$/i,'').trim()||'chatgpt';const safe=raw.replace(/[\\/:*?"<>|]+/g,'-').replace(/[. ]+$/g,'').trim().slice(0,120)||'chatgpt-conversation';return `${safe}.${ext}`;}
  function normalizeExportOptions(o={}){return{mode:['current','all','custom'].includes(o.mode)?o.mode:'current',scope:['all','user','assistant','bookmarks'].includes(o.scope)?o.scope:'all',start:Math.max(1,Number(o.start)||1),end:Math.max(1,Number(o.end)||999),includeMeta:o.includeMeta!==false,includeImages:o.includeImages!==false};}
  async function ensureExportReady(options){
    if(options.mode==='all'||options.mode==='custom'){
      if(scanBusy)throw new Error(scanPaused?'SCAN_PAUSED':'SCAN_IN_PROGRESS');
      if(!fullScanStillValid()){
        const result=await scanFullChat(true);
        if(!result.complete)throw new Error('FULL_SCAN_INCOMPLETE');
      }
    }else collectRecords();
    if(!exportRecords(options).length)throw new Error('NO_EXPORT_CONTENT');
  }
  function currentLoadedRecords(){let q=0;const records=[];turnShells().forEach((shell,index)=>{const role=roleOf(shell);if(role!=='user'&&role!=='assistant')return;if(role==='user')q++;const text=textOf(shell,role),image=imageOf(shell,role);if(!text&&!image)return;const html=htmlOf(shell,role),markdown=markdownOf(shell,role);records.push({key:keyOf(shell,index),role,text,html,markdown,image,order:orderOf(shell,index),testid:shell.getAttribute('data-testid')||'',shell,index,question:q||1});});return records;}
  function exportRecords(options){let records=options.mode==='current'?currentLoadedRecords():allRecords().filter(r=>r.text||r.html||r.image);if(options.mode==='custom'){if(options.scope==='user')records=records.filter(r=>r.role==='user');else if(options.scope==='assistant')records=records.filter(r=>r.role==='assistant');else if(options.scope==='bookmarks')records=records.filter(r=>bookmarks.has(r.key));const a=Math.min(options.start,options.end),b=Math.max(options.start,options.end);records=records.filter(r=>r.question>=a&&r.question<=b);}return records;}
  function stripImagesFromHtml(html){const t=document.createElement('template');t.innerHTML=html;t.content.querySelectorAll('img,picture,figure').forEach(n=>n.remove());return t.innerHTML;}
  function stripImagesFromMarkdown(md){return String(md||'').replace(/!\[[^\]]*\]\([^\)]+\)/g,'');}
  function imageUrlsFromHtml(html){if(!html)return[];const t=document.createElement('template');t.innerHTML=html;return [...t.content.querySelectorAll('img[src]')].map(img=>img.getAttribute('src')||'').filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);}
  function imageLinesForText(record){const urls=imageUrlsFromHtml(record.html);if(record.image&&!urls.includes(record.image))urls.push(record.image);return urls.map((url,i)=>`[图片 ${i+1}] ${url}`);}
  function roleLabel(role){return role==='user'?nt('you'):nt('gpt');}
  function buildMarkdown(options){const records=exportRecords(options),parts=[];if(options.includeMeta)parts.push(`# ${(document.title||'ChatGPT Conversation').replace(/\s*-\s*ChatGPT.*$/i,'').trim()}`,'',`> ${nt('source')}: ${location.href}`,'');records.forEach((r,i)=>{parts.push(`## Q${r.question} · ${roleLabel(r.role)}`,'');let body=r.markdown||r.text;if(!options.includeImages)body=stripImagesFromMarkdown(body);parts.push(body.trim()||nt('emptyText'),'');if(i<records.length-1)parts.push('---','');});return parts.join('\n').replace(/\n{4,}/g,'\n\n\n').trim()+'\n';}
  function buildText(options){const records=exportRecords(options),parts=[];if(options.includeMeta)parts.push((document.title||'ChatGPT Conversation').replace(/\s*-\s*ChatGPT.*$/i,'').trim(),`${nt('source')}: ${location.href}`,'');records.forEach(r=>{parts.push(`========== Q${r.question} · ${roleLabel(r.role)} ==========`);if(r.text)parts.push(r.text);if(options.includeImages){const lines=imageLinesForText(r);if(lines.length)parts.push('',...lines);}parts.push('');});return parts.join('\n').trim()+'\n';}
  function copyText(text){return navigator.clipboard.writeText(text).catch(()=>{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('copy-failed');});}
  function download(name,text,type='text/plain;charset=utf-8'){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);}
  function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
  function buildPrintHtml(options){const records=exportRecords(options);const title=(document.title||'ChatGPT Conversation').replace(/\s*-\s*ChatGPT.*$/i,'').trim();const turns=records.map(r=>{const content=r.html?(options.includeImages?r.html:stripImagesFromHtml(r.html)):`<p>${escapeHtml(r.text).replace(/\n/g,'<br>')}</p>`;const who=roleLabel(r.role);return `<section class="turn ${r.role}"><aside class="role-col"><span class="role-badge ${r.role}">${who}</span><span class="qnum">Q${r.question}</span></aside><div class="message ${r.role}"><div class="content">${content}</div></div></section>`;}).join('');return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{margin:15mm 13mm}*{box-sizing:border-box}body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#202123;background:#fff;margin:0;font-size:14px;line-height:1.72}.page{max-width:920px;margin:0 auto}.doc-head{padding:0 0 20px;border-bottom:1px solid #e5e7eb;margin-bottom:22px}.doc-head h1{font-size:24px;margin:0 0 5px}.source{font-size:11px;color:#7c828d;word-break:break-all}.turn{display:grid;grid-template-columns:72px minmax(0,1fr);gap:14px;align-items:start;margin:0 0 25px;page-break-inside:auto}.role-col{display:flex;flex-direction:column;align-items:center;gap:5px;padding-top:2px}.role-badge{min-width:48px;padding:5px 8px;border-radius:999px;text-align:center;font-size:11px;font-weight:800;letter-spacing:.02em}.role-badge.user{background:#eaf1ff;color:#245cff;border:1px solid #cfddff}.role-badge.assistant{background:#eff2f4;color:#28313b;border:1px solid #dfe4e8}.qnum{font-size:9px;color:#9299a4;font-weight:700}.message{min-width:0}.message.user{display:flex;justify-content:flex-start}.message.user .content{display:inline-block;max-width:82%;background:#f4f4f4;border:1px solid #ededed;border-radius:18px;padding:11px 14px}.message.assistant .content{width:100%;padding:2px 0}.content p{margin:0 0 12px}.content p:last-child{margin-bottom:0}.content h1,.content h2,.content h3,.content h4{line-height:1.35;margin:20px 0 9px}.content h1{font-size:22px}.content h2{font-size:19px}.content h3{font-size:16px}.content ul,.content ol{padding-left:24px}.content blockquote{margin:12px 0;padding:2px 14px;border-left:3px solid #cfd5df;color:#555}.content pre{white-space:pre-wrap;word-break:break-word;background:#f6f7f8;border:1px solid #e2e5e9;border-radius:10px;padding:12px;overflow:hidden}.content code{font-family:"SFMono-Regular",Consolas,monospace;font-size:.92em}.content table{width:100%;border-collapse:collapse;margin:12px 0}.content th,.content td{border:1px solid #dfe3e8;padding:7px 9px;text-align:left;vertical-align:top}.content img{display:block;max-width:min(100%,720px);max-height:620px;width:auto!important;height:auto!important;object-fit:contain;border-radius:10px;margin:12px 0;background:#fff}.content figure,.content picture{max-width:100%}.content a{color:#245cff;text-decoration:none}@media print{a{color:inherit;text-decoration:none}.turn{break-inside:auto}.content pre,.content table,.content img,.content figure{break-inside:avoid;page-break-inside:avoid}.role-col{break-inside:avoid}}</style></head><body><div class="page">${options.includeMeta?`<header class="doc-head"><h1>${escapeHtml(title)}</h1><div class="source">${escapeHtml(nt('source'))}: ${escapeHtml(location.href)}</div></header>`:''}${turns}</div></body></html>`;}
  async function copyMarkdown(options){await ensureExportReady(options);await copyText(buildMarkdown(options));return exportRecords(options).length;}
  async function exportMarkdown(options){await ensureExportReady(options);const text='\ufeff'+buildMarkdown(options);download(fileName('md'),text,'text/markdown;charset=utf-8');return exportRecords(options).length;}
  async function exportText(options){await ensureExportReady(options);const text='\ufeff'+buildText(options);download(fileName('txt'),text,'text/plain;charset=utf-8');return exportRecords(options).length;}
  async function copyConversationText(options){await ensureExportReady(options);await copyText(buildText(options));return exportRecords(options).length;}
  async function printConversation(options){await ensureExportReady(options);const html=buildPrintHtml(options),frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:-10000px;top:0;width:1000px;height:800px;opacity:0;pointer-events:none';document.body.appendChild(frame);const doc=frame.contentDocument;if(!doc){frame.remove();throw new Error('print-frame');}doc.open();doc.write(html);doc.close();const imgs=[...doc.images];if(imgs.length){await Promise.race([Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(r=>{img.addEventListener('load',r,{once:true});img.addEventListener('error',r,{once:true});}))),sleep(2500)]);}await sleep(120);try{frame.contentWindow?.focus();frame.contentWindow?.print();}catch(_){}setTimeout(()=>frame.remove(),1800);return exportRecords(options).length;}

  function navCss() {
    return `
      :host{all:initial}*{box-sizing:border-box}.gv-root{font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;position:fixed;right:18px;top:50%;transform:translateY(-50%);z-index:2147483000;color:#17213b}.gv-root.custom{right:auto;transform:none}.rail{display:flex;flex-direction:column;align-items:center;gap:7px}.grip{width:40px;height:24px;border-radius:9px;display:grid;place-items:center;color:#9099aa;font-size:15px;cursor:grab;user-select:none}.grip:hover{background:#f2f5fb;color:#2f64ff}.grip:active{cursor:grabbing}.rail-btn{width:40px;height:40px;border:1px solid #e1e6ef;background:rgba(255,255,255,.97);color:#34415d;border-radius:12px;display:grid;place-items:center;box-shadow:0 6px 18px rgba(23,44,88,.09);cursor:pointer;font:700 15px/1 system-ui}.rail-btn:hover{border-color:#b9c9fb;background:#f4f7ff;color:#2f64ff}.count{width:46px;min-height:50px;padding:6px 3px;font-size:9px;line-height:1.25;color:#6e788c}.menu{color:#2f64ff}.panel{display:none;position:absolute;right:50px;top:50%;transform:translateY(-50%);width:420px;height:min(76vh,720px);min-width:330px;min-height:360px;max-width:min(70vw,760px);max-height:calc(100vh - 28px);resize:both;overflow:hidden;background:rgba(255,255,255,.985);border:1px solid #e1e6ef;border-radius:18px;box-shadow:0 24px 70px rgba(19,39,81,.18);backdrop-filter:blur(16px)}.panel.open{display:flex;flex-direction:column}.panel.open-right{right:auto;left:50px}.panel-head{flex:0 0 auto;padding:15px 15px 12px;border-bottom:1px solid #edf0f5}.title-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.title{font-size:15px;font-weight:800;color:#121b31}.meta{font-size:10px;color:#8b94a5}.search{width:100%;margin-top:11px;padding:10px 11px;border:1px solid #dde3ed;border-radius:11px;background:#fafbfe;color:#26334b;font:12px/1.2 inherit;outline:none}.search:focus{background:#fff;border-color:#9cb5ff;box-shadow:0 0 0 3px rgba(47,100,255,.08)}.tabs-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}.tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;flex:1}.filters{display:flex;gap:5px;flex-wrap:wrap}.filter-row.hidden{display:none}.tab,.filter,.scan{border:1px solid #e2e7ef;background:#fff;color:#58647b;border-radius:9px;padding:6px 9px;font:700 10px/1 inherit;cursor:pointer}.tab.active,.filter.active{background:#eef3ff;border-color:#c9d6ff;color:#2f64ff}.scan{color:#315cbd}.scan.active{background:#eef3ff;border-color:#c9d6ff;color:#2f64ff}.list{flex:1 1 auto;min-height:0;overflow:auto;padding:8px;scrollbar-gutter:stable}.item{display:flex;align-items:stretch;gap:4px;margin:2px 0}.go{flex:1;min-width:0;border:1px solid transparent;background:transparent;border-radius:12px;padding:9px 10px;text-align:left;cursor:pointer;color:#26334b}.go:hover{background:#f7f9fd}.go.current{background:#eef3ff;border-color:#d9e3ff}.top{display:flex;align-items:center;gap:7px;margin-bottom:4px}.num{font-size:9px;color:#a0a7b3;min-width:24px}.role{font-size:9px;font-weight:800;color:#70798a}.badge{margin-left:auto;font-size:8px;color:#2f64ff;font-weight:800}.content-row{display:flex;align-items:flex-start;gap:9px}.text{flex:1;min-width:0;font-size:12px;line-height:1.45;color:#35415a;word-break:break-word}.thumb{flex:0 0 56px;width:56px;height:42px;object-fit:cover;border-radius:8px;border:1px solid #e5e9f0;background:#f4f6f9}.star{flex:0 0 31px;width:31px;border:0;background:transparent;border-radius:9px;color:#adb4bf;font-size:16px;cursor:pointer}.star:hover,.star.active{background:#fff8df;color:#d2a116}.empty{padding:34px 20px;text-align:center;color:#98a0ad;font-size:12px}.foot{flex:0 0 auto;border-top:1px solid #edf0f5;padding:8px 12px;color:#9aa2ae;font-size:9px;text-align:center}.toast{display:none;position:absolute;right:50px;top:calc(50% - 235px);padding:8px 11px;background:#152954;color:#fff;border-radius:9px;box-shadow:0 8px 22px rgba(18,35,72,.2);font-size:10px}.toast.show{display:block}
      .gv-root.theme-dark{color:#eee}.gv-root.theme-dark .rail-btn{background:rgba(32,36,45,.98);border-color:#3b4250;color:#e6e9ef}.gv-root.theme-dark .grip:hover,.gv-root.theme-dark .rail-btn:hover{background:#293145;color:#8da7ff}.gv-root.theme-dark .panel{background:rgba(28,32,40,.985);border-color:#3c4350}.gv-root.theme-dark .panel-head,.gv-root.theme-dark .foot{border-color:#393f4a}.gv-root.theme-dark .title{color:#f4f5f8}.gv-root.theme-dark .meta,.gv-root.theme-dark .num,.gv-root.theme-dark .role,.gv-root.theme-dark .foot{color:#949baa}.gv-root.theme-dark .search{background:#242933;border-color:#414956;color:#f0f2f5}.gv-root.theme-dark .search:focus{background:#20252e}.gv-root.theme-dark .tab,.gv-root.theme-dark .filter,.gv-root.theme-dark .scan{background:#242933;border-color:#414956;color:#b4bdcd}.gv-root.theme-dark .tab.active,.gv-root.theme-dark .filter.active{background:#293a67;border-color:#3e5a9e;color:#abc0ff}.gv-root.theme-dark .scan.active{background:#293a67;border-color:#3e5a9e;color:#abc0ff}.gv-root.theme-dark .go{color:#eee}.gv-root.theme-dark .go:hover{background:#252c37}.gv-root.theme-dark .go.current{background:#293653;border-color:#3b4d75}.gv-root.theme-dark .text{color:#e4e7ec}.gv-root.theme-dark .star:hover,.gv-root.theme-dark .star.active{background:#433a1f;color:#ffd46c}
      @media(max-width:760px){.gv-root{right:8px!important;left:auto!important;top:auto!important;bottom:88px;transform:none!important}.rail{flex-direction:row}.grip{display:none}.panel,.panel.open-right{position:fixed;left:8px;right:8px;top:72px;bottom:145px;width:auto!important;height:auto!important;min-width:0;min-height:0;max-width:none;max-height:none;transform:none;resize:none}}
    `;
  }
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function btn(cls, id, text, title) { const b = el('button', cls, text); b.type = 'button'; if (id) b.id = id; if (title) { b.title = title; b.setAttribute('aria-label', title); } return b; }

  function buildNavigator() {
    navShadow.replaceChildren();
    const style = el('style'); style.textContent = navCss(); navShadow.appendChild(style);
    const root = el('div', 'gv-root'); root.id = 'root';
    const toast = el('div', 'toast'); toast.id = 'toast'; root.appendChild(toast);
    const panel = el('section', 'panel'); panel.id = 'panel';
    const head = el('div', 'panel-head');
    const titleRow = el('div', 'title-row'); titleRow.append(el('div','title',nt('title'))); const meta = el('div','meta',`0 ${nt('questions')}`); meta.id='meta'; titleRow.append(meta); head.append(titleRow);
    const search = el('input','search'); search.id='search'; search.type='search'; search.placeholder=nt('searchPh'); head.append(search);
    const tabsRow = el('div','tabs-row'); const tabs = el('div','tabs');
    tabs.append(btn('tab active','tabOutline',nt('outline')),btn('tab','tabSearch',nt('search')),btn('tab','tabBookmarks',nt('bookmarks')));
    const scan = btn('scan','scanBtn',nt('fullScan'),nt('scanVirtual')); tabsRow.append(tabs,scan); head.append(tabsRow);
    const filterRow = el('div','tabs-row filter-row hidden'); filterRow.id='filterRow'; const filters = el('div','filters');
    filters.append(btn('filter active','filterAll',nt('all')),btn('filter','filterUser',nt('you')),btn('filter','filterAssistant',nt('gpt'))); filterRow.append(filters); head.append(filterRow);
    panel.append(head); const list=el('div','list'); list.id='list'; panel.append(list); panel.append(el('div','foot',nt('shortcut'))); root.append(panel);
    const rail=el('div','rail'); const grip=el('div','grip','⠿'); grip.id='grip'; grip.title=nt('drag'); rail.append(grip,btn('rail-btn','prevBtn','↑',nt('prev')));
    const count=btn('rail-btn count','countBtn','0/0',nt('openOutline')); rail.append(count,btn('rail-btn','nextBtn','↓',nt('next')),btn('rail-btn menu','menuBtn','☷',nt('openNav'))); root.append(rail);
    navShadow.appendChild(root);
  }

  function ensureNavigator(force=false) {
    if (!settings.navigatorEnabled) { navResizeObserver?.disconnect(); navResizeObserver=null; navHost?.remove(); navHost=null; navShadow=null; navOpen=false; return; }
    if (force && navHost) { navResizeObserver?.disconnect(); navResizeObserver=null; navHost.remove(); navHost=null; navShadow=null; navOpen=false; }
    if (navHost?.isConnected || !document.body) return;
    navHost = document.createElement('div'); navHost.id=NAV_ID; navShadow=navHost.attachShadow({mode:'open'}); buildNavigator(); document.body.appendChild(navHost);
    wireNavigator(); applyNavLayout(); syncNavigatorTheme(); refreshNavigator(); syncNavigatorScanButton();
  }

  function wireNavigator() {
    navShadow.getElementById('menuBtn').addEventListener('click', toggleNavigator);
    navShadow.getElementById('countBtn').addEventListener('click', toggleNavigator);
    navShadow.getElementById('prevBtn').addEventListener('click', () => jumpQuestion(-1));
    navShadow.getElementById('nextBtn').addEventListener('click', () => jumpQuestion(1));
    navShadow.getElementById('tabOutline').addEventListener('click', () => setMode('outline'));
    navShadow.getElementById('tabSearch').addEventListener('click', () => setMode('search'));
    navShadow.getElementById('tabBookmarks').addEventListener('click', () => setMode('bookmarks'));
    navShadow.getElementById('search').addEventListener('input', () => { const q=navShadow.getElementById('search').value.trim(); setMode(q ? 'search' : 'outline'); });
    navShadow.getElementById('filterAll').addEventListener('click',()=>setRole('all'));
    navShadow.getElementById('filterUser').addEventListener('click',()=>setRole('user'));
    navShadow.getElementById('filterAssistant').addEventListener('click',()=>setRole('assistant'));
    navShadow.getElementById('scanBtn').addEventListener('click',()=>{if(scanBusy){setScanPaused(!scanPaused);return;}scanFullChat(false);});
    setupDrag(); setupResize();
  }
  function setMode(mode) {
    navMode=mode;
    ['Outline','Search','Bookmarks'].forEach((name)=>navShadow.getElementById(`tab${name}`).classList.toggle('active',mode===name.toLowerCase()));
    navShadow.getElementById('filterRow')?.classList.toggle('hidden',mode==='outline');
    renderNavigator();
  }
  function setRole(role) {
    searchRole=role;
    navShadow.getElementById('filterAll').classList.toggle('active',role==='all');
    navShadow.getElementById('filterUser').classList.toggle('active',role==='user');
    navShadow.getElementById('filterAssistant').classList.toggle('active',role==='assistant');
    if (navMode==='search'||navMode==='bookmarks') renderNavigator();
  }
  function toggleNavigator() {
    if (!navShadow) return;
    navOpen=!navOpen; navShadow.getElementById('panel').classList.toggle('open',navOpen); positionPanel();
    if (navOpen) { refreshNavigator(); if(navMode==='search')setTimeout(()=>navShadow?.getElementById('search')?.focus(),50); }
  }
  function closeNavigator() { navOpen=false; navShadow?.getElementById('panel')?.classList.remove('open'); }
  function showNavToast(text) {
    if (!navShadow) return; const t=navShadow.getElementById('toast'); clearTimeout(toastTimer); t.textContent=text; t.classList.add('show'); toastTimer=setTimeout(()=>t.classList.remove('show'),1300);
  }

  function detectCurrentQuestion() {
    const mounted=userRecords(); const allUsers=allRecords().filter(r=>r.role==='user'); if (!mounted.length || !allUsers.length) return 0;
    const line=window.innerHeight*.32; let best=mounted[0], dist=Infinity;
    mounted.forEach((r)=>{ const top=r.shell?.getBoundingClientRect().top ?? 99999; const d=Math.abs(top-line); if (top<=line+120 && d<dist) {dist=d;best=r;} });
    const idx=allUsers.findIndex(r=>r.key===best.key); return idx>=0?idx:0;
  }
  function jumpQuestion(dir) {
    const users=allRecords().filter(r=>r.role==='user'); if (!users.length) return;
    const idx=clamp(detectCurrentQuestion()+dir,0,users.length-1); currentQuestion=idx; jumpRecord(users[idx]); refreshNavigator();
  }
  function jumpRecord(record) {
    let shell=record.shell;
    if (!shell && record.testid) shell=document.querySelector(`[data-testid="${CSS.escape(record.testid)}"]`);
    if (shell) { shell.scrollIntoView({behavior:'smooth',block:'start'}); closeNavigator(); }
    else showNavToast(nt('notLoaded'));
  }
  async function toggleBookmark(record) {
    const existed=bookmarks.has(record.key);if(existed)bookmarks.delete(record.key);else bookmarks.add(record.key);
    try{await saveBookmarks();}catch(_){if(existed)bookmarks.add(record.key);else bookmarks.delete(record.key);showNavToast(settings.language==='en'?'Failed to save bookmark':'书签保存失败');}
    renderNavigator();
  }
  function itemNode(record,index,isCurrent=false) {
    const row=el('div','item'); const go=btn('go'+(isCurrent?' current':''),null,''); const top=el('div','top');
    top.append(el('span','num',String(index+1).padStart(2,'0')),el('span','role',record.role==='user'?nt('you'):nt('gpt'))); if (isCurrent) top.append(el('span','badge',nt('current')));
    const body=el('div','content-row'); const text=el('div','text',(record.text||(record.image?nt('image'):nt('unloaded'))).replace(/\s+/g,' ').slice(0,150)); body.append(text); if(record.image){const img=el('img','thumb');img.src=record.image;img.alt=nt('imageAlt');img.loading='lazy';body.append(img);} go.replaceChildren(top,body); go.addEventListener('click',()=>jumpRecord(record));
    const star=btn('star'+(bookmarks.has(record.key)?' active':''),null,bookmarks.has(record.key)?'★':'☆',bookmarks.has(record.key)?nt('unbookmark'):nt('bookmark')); star.addEventListener('click',()=>toggleBookmark(record)); row.append(go,star); return row;
  }
  function renderNavigator() {
    if (!navShadow) return;
    const list=navShadow.getElementById('list'); list.replaceChildren(); const records=allRecords(); const users=records.filter(r=>r.role==='user');
    currentQuestion=detectCurrentQuestion();
    if (navMode==='outline') {
      if (!users.length) { list.append(el('div','empty',nt('noQuestions'))); return; }
      users.forEach((r,i)=>list.append(itemNode(r,i,i===currentQuestion))); return;
    }
    if (navMode==='bookmarks') {
      const saved=records.filter(r=>bookmarks.has(r.key)&&(searchRole==='all'||r.role===searchRole)); if (!saved.length) { list.append(el('div','empty',nt('noBookmarks'))); return; }
      saved.forEach((r,i)=>list.append(itemNode(r,i,false))); return;
    }
    const q=(navShadow.getElementById('search')?.value||'').trim().toLocaleLowerCase(); if (!q) { list.append(el('div','empty',nt('searchHint'))); return; }
    const hits=records.filter(r=>(searchRole==='all'||r.role===searchRole)&&r.text.toLocaleLowerCase().includes(q));
    if (!hits.length) { list.append(el('div','empty',nt('noMatches'))); return; }
    hits.slice(0,300).forEach((r,i)=>list.append(itemNode(r,i,false)));
  }
  function refreshNavigator() {
    if (!navShadow) return; syncNavigatorTheme(); collectRecords(); const users=allRecords().filter(r=>r.role==='user'); currentQuestion=detectCurrentQuestion(); const count=navShadow.getElementById('countBtn'); count.textContent=`${users.length?currentQuestion+1:0}/${users.length}`; navShadow.getElementById('meta').textContent=`${users.length} ${nt('questions')} · ${allRecords().length} ${nt('messages')}`; if (navOpen) renderNavigator(); positionPanel();
  }

  function hasConversationContent(){return turnShells().some(shell=>{const role=roleOf(shell);return role==='user'||role==='assistant';});}
  function scrollableCandidate(node){if(!node||!(node instanceof Element))return false;const r=node.getBoundingClientRect();if(r.height<220||r.width<260||r.bottom<0||r.top>innerHeight)return false;const cs=getComputedStyle(node),oy=cs.overflowY;return (oy==='auto'||oy==='scroll'||oy==='overlay'||node.scrollHeight>node.clientHeight+80)&&node.scrollHeight>node.clientHeight+40;}
  function findScroller() {
    const shells=turnShells(),mounted=shells.filter(s=>roleNodeOf(s,roleOf(s))&&((textOf(s,roleOf(s))||'').length||s.querySelector?.('img')));const probes=[mounted[0],mounted[mounted.length-1],shells[0],shells[shells.length-1]].filter(Boolean);const scores=new Map();
    const add=(node,score)=>{if(!node||!scrollableCandidate(node))return;scores.set(node,Math.max(scores.get(node)||-Infinity,score));};
    probes.forEach((probe,pi)=>{let node=probe.parentElement,depth=0;while(node&&node!==document.body&&node!==document.documentElement){const cs=getComputedStyle(node),overflow=/auto|scroll|overlay/.test(cs.overflowY);let score=12000-depth*120+(overflow?3200:0)+(node.contains(probe)?1800:0)+Math.min(1800,(node.scrollHeight-node.clientHeight)/4);if(pi===1)score+=900;add(node,score);node=node.parentElement;depth++;}});
    document.querySelectorAll('main [class*="overflow-y-auto"],main [class*="overflow-auto"],main [data-scroll-root],#thread').forEach(node=>{let score=2200+Math.min(1600,(node.scrollHeight-node.clientHeight)/4);if(probes.some(p=>p&&node.contains(p)))score+=7500;add(node,score);});
    const doc=document.scrollingElement||document.documentElement;if(doc){let score=500;if(probes.some(p=>p&&document.body?.contains(p)))score+=100; scores.set(doc,score);}
    return [...scores.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||doc;
  }
  function isDocumentScroller(scroller){return scroller===document.scrollingElement||scroller===document.documentElement||scroller===document.body;}
  function scrollPos(scroller){ return isDocumentScroller(scroller) ? window.scrollY : scroller.scrollTop; }
  function setScrollPos(scroller,v){const top=Math.max(0,v);if(isDocumentScroller(scroller)){window.scrollTo({top,behavior:'auto'});document.scrollingElement&&(document.scrollingElement.scrollTop=top);}else{try{scroller.scrollTo({top,behavior:'auto'});}catch(_){scroller.scrollTop=top;}scroller.scrollTop=top;try{scroller.dispatchEvent(new Event('scroll',{bubbles:false}));}catch(_){}}}
  function viewHeight(scroller){ return isDocumentScroller(scroller) ? window.innerHeight : scroller.clientHeight; }
  function scrollHeightOf(scroller){return isDocumentScroller(scroller)?Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0):scroller.scrollHeight;}
  function viewportTopOf(scroller){return isDocumentScroller(scroller)?0:scroller.getBoundingClientRect().top;}
  function viewportBottomOf(scroller){return viewportTopOf(scroller)+viewHeight(scroller);}
  function lastTurnVisible(scroller){const shells=turnShells();const last=[...shells].reverse().find(s=>{const r=roleOf(s);return r==='user'||r==='assistant';});if(!last)return true;const r=last.getBoundingClientRect(),top=viewportTopOf(scroller),bottom=viewportBottomOf(scroller);return r.bottom<=bottom+40&&r.bottom>=top-20&&r.top<bottom;}
  function nativeBottomButton(){const selectors=['button[data-testid*="scroll-to-bottom"]','button[aria-label*="Scroll to bottom"]','button[aria-label*="scroll to bottom"]','button[aria-label*="Jump to bottom"]','button[aria-label*="Go to latest"]','button[aria-label*="滚动到底部"]','button[aria-label*="转到底部"]','button[aria-label*="跳到底部"]','button[aria-label*="最新消息"]','button[title*="底部"]','button[title*="bottom"]'];for(const sel of selectors){for(const b of document.querySelectorAll(sel)){const r=b.getBoundingClientRect();if(r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight)return b;}}return null;}
  function clickNativeBottom(){const b=nativeBottomButton();if(!b)return false;try{b.click();return true;}catch(_){return false;}}
  function captureScrollAnchor(scroller){const top=viewportTopOf(scroller),bottom=top+viewHeight(scroller);let best=null,bestDist=Infinity;turnShells().forEach((shell,index)=>{const r=shell.getBoundingClientRect();if(r.bottom<top||r.top>bottom)return;const d=Math.abs(r.top-top);if(d<bestDist){bestDist=d;best={key:keyOf(shell,index),offset:r.top-top};}});return best;}
  function restoreScrollAnchor(scroller,anchor,fallback){if(!anchor){setScrollPos(scroller,fallback);return;}const shells=turnShells();const shell=shells.find((x,i)=>keyOf(x,i)===anchor.key);if(!shell){setScrollPos(scroller,fallback);return;}const top=viewportTopOf(scroller),current=shell.getBoundingClientRect().top-top;setScrollPos(scroller,scrollPos(scroller)+(current-anchor.offset));}
  function scanSignature(scroller){const shells=turnShells(),first=shells[0],last=shells[shells.length-1];return `${first?keyOf(first,0):'none'}|${last?keyOf(last,shells.length-1):'none'}|${shells.length}|${messageCache.size}|${Math.round(scrollHeightOf(scroller))}`;}
  async function scanCheckpoint(){if(activeScanConversationKey&&activeScanConversationKey!==conversationKey())throw new Error('SCAN_ROUTE_CHANGED');while(scanPaused&&!scanCancelRequested){scanProgress(scanProgressValue<0?1:scanProgressValue,nt('scanPaused'),false,'paused');await sleep(160);if(activeScanConversationKey&&activeScanConversationKey!==conversationKey())throw new Error('SCAN_ROUTE_CHANGED');}if(scanCancelRequested)throw new Error('SCAN_CANCELLED');if(activeScanConversationKey&&activeScanConversationKey!==conversationKey())throw new Error('SCAN_ROUTE_CHANGED');}
  function syncNavigatorScanButton(){const button=navShadow?.getElementById('scanBtn');if(!button)return;button.disabled=false;button.textContent=!scanBusy?nt('fullScan'):(scanPaused?nt('scanResume'):nt('scanPause'));button.classList.toggle('active',scanBusy);}
  function setScanPaused(next){scanPaused=!!next;syncNavigatorScanButton();scanProgress(scanProgressValue<0?1:scanProgressValue,scanPaused?nt('scanPaused'):nt('scanSweep'),false,scanPaused?'paused':'running');}
  function cancelScan(){scanCancelRequested=true;scanPaused=false;}
  function ensureScanStatus(){
    if(scanStatusHost?.isConnected)return scanStatusHost.shadowRoot;
    scanStatusHost=document.createElement('div');scanStatusHost.id=SCAN_STATUS_ID;const shadow=scanStatusHost.attachShadow({mode:'open'});
    const style=document.createElement('style');style.textContent=`:host{all:initial}.box{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483646;width:min(500px,calc(100vw - 32px));padding:12px 14px;border-radius:14px;background:rgba(17,24,39,.96);color:#fff;box-shadow:0 16px 40px rgba(0,0,0,.28);font:12px/1.45 Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;backdrop-filter:blur(12px)}.row{display:flex;align-items:center;justify-content:space-between;gap:12px}.text{font-weight:700}.pct{font-variant-numeric:tabular-nums;color:#c9d7ff}.track{height:5px;border-radius:999px;background:#374151;margin-top:9px;overflow:hidden}.bar{height:100%;width:0;background:#5b83ff;border-radius:999px;transition:width .16s ease}.actions{display:flex;justify-content:flex-end;gap:7px;margin-top:9px}.actions button{border:1px solid #4b5563;background:#273244;color:#fff;border-radius:8px;padding:5px 10px;font:600 11px/1.2 inherit;cursor:pointer}.actions button:hover{background:#344158}.stop{border-color:#7f3f46!important;background:#542b31!important}.done .bar{background:#35c77a}.done .actions{display:none}`;shadow.append(style);
    const box=document.createElement('div');box.className='box';const row=document.createElement('div');row.className='row';const text=document.createElement('span');text.className='text';const pct=document.createElement('span');pct.className='pct';pct.textContent='0%';row.append(text,pct);const track=document.createElement('div');track.className='track';const bar=document.createElement('div');bar.className='bar';track.appendChild(bar);const actions=document.createElement('div');actions.className='actions';const pause=document.createElement('button');pause.className='pause';pause.textContent=nt('scanPause');pause.addEventListener('click',()=>setScanPaused(!scanPaused));const stop=document.createElement('button');stop.className='stop';stop.textContent=nt('scanStop');stop.addEventListener('click',cancelScan);actions.append(pause,stop);box.append(row,track,actions);shadow.append(box);document.body.appendChild(scanStatusHost);return shadow;
  }
  function scanProgress(percent,text,done=false,state=null){
    const p=Math.max(0,Math.min(100,Math.round(percent||0)));if(p===scanProgressValue&&!done&&!state)return;scanProgressValue=p;
    const shadow=ensureScanStatus(),box=shadow.querySelector('.box');box.classList.toggle('done',!!done);shadow.querySelector('.text').textContent=text||nt('scanSweep');shadow.querySelector('.pct').textContent=`${p}%`;shadow.querySelector('.bar').style.width=`${p}%`;const pause=shadow.querySelector('.pause'),stop=shadow.querySelector('.stop');if(pause)pause.textContent=scanPaused?nt('scanResume'):nt('scanPause');if(stop)stop.textContent=nt('scanStop');
    const currentState=done?'idle':(state||(scanPaused?'paused':'running'));syncNavigatorScanButton();try{const sent=chrome.runtime.sendMessage({type:'gpt-view-plus-scan-progress',percent:p,text:text||'',state:currentState});sent?.catch?.(()=>{});}catch(_){}
    if(done){clearTimeout(scanProgress.t);scanProgress.t=setTimeout(()=>{scanStatusHost?.remove();scanStatusHost=null;scanProgressValue=-1;},3000);}
  }
  function bottomState(scroller){const max=Math.max(0,scrollHeightOf(scroller)-viewHeight(scroller)),pos=scrollPos(scroller);return {max,pos,atBottom:pos>=max-8,visible:lastTurnVisible(scroller),sig:scanSignature(scroller)};}
  async function confirmBottomStability(initialScroller,stableMs=2400,maxMs=12000){let scroller=initialScroller,lastSig='',lastPos=-1,stableSince=0,start=Date.now();while(Date.now()-start<maxMs){await scanCheckpoint();const better=findScroller();if(better&&better!==scroller){scroller=better;lastSig='';lastPos=-1;stableSince=0;}clickNativeBottom();const max=Math.max(0,scrollHeightOf(scroller)-viewHeight(scroller));setScrollPos(scroller,max);await sleep(240);collectRecords();const st=bottomState(scroller),same=st.atBottom&&st.visible&&st.sig===lastSig&&Math.abs(st.pos-lastPos)<4;if(same){if(!stableSince)stableSince=Date.now();if(Date.now()-stableSince>=stableMs)return {ok:true,scroller};}else stableSince=0;lastSig=st.sig;lastPos=st.pos;}return {ok:false,scroller};}
  async function reachTrueBottom(initialScroller){let scroller=initialScroller,lastSig='',lastPos=-1,stableSince=0;for(let i=0;i<220;i++){
      await scanCheckpoint();
      if(i%28===0){const better=findScroller();if(better&&better!==scroller){scroller=better;stableSince=0;lastSig='';lastPos=-1;}}
      clickNativeBottom();const max=Math.max(0,scrollHeightOf(scroller)-viewHeight(scroller)),cur=scrollPos(scroller),step=Math.max(420,viewHeight(scroller)*.88);setScrollPos(scroller,Math.min(max,cur+step));await sleep(i<20?190:270);collectRecords();
      const st=bottomState(scroller),same=st.atBottom&&st.visible&&st.sig===lastSig&&Math.abs(st.pos-lastPos)<4;if(same){if(!stableSince)stableSince=Date.now();if(Date.now()-stableSince>=1800)break;}else stableSince=0;lastSig=st.sig;lastPos=st.pos;scanProgress(Math.min(24,3+i*.10),nt('scanBottom'));
      if(st.atBottom&&!st.visible){clickNativeBottom();await sleep(260);}
    }
    clickNativeBottom();const max=Math.max(0,scrollHeightOf(scroller)-viewHeight(scroller));setScrollPos(scroller,max);await sleep(480);collectRecords();return confirmBottomStability(findScroller()||scroller,2600,14000);
  }
  async function reachTrueTop(initialScroller){let scroller=initialScroller,lastSig='',stableSince=0;for(let i=0;i<230;i++){
      await scanCheckpoint();
      if(i%30===0){const better=findScroller();if(better&&better!==scroller){scroller=better;stableSince=0;lastSig='';}}
      const cur=scrollPos(scroller);setScrollPos(scroller,Math.max(0,cur-Math.max(460,viewHeight(scroller)*.9)));await sleep(240);collectRecords();if(scrollPos(scroller)<=5)setScrollPos(scroller,0);await sleep(110);collectRecords();const sig=scanSignature(scroller),same=scrollPos(scroller)<=5&&sig===lastSig;if(same){if(!stableSince)stableSince=Date.now();if(Date.now()-stableSince>=2600)break;}else stableSince=0;lastSig=sig;scanProgress(Math.min(43,25+i*.08),nt('scanTop'));
    }
    setScrollPos(scroller,0);await sleep(500);collectRecords();const finalSig=scanSignature(scroller);await sleep(700);collectRecords();return {ok:scrollPos(scroller)<=5&&scanSignature(scroller)===finalSig,scroller};
  }
  async function scanTopToBottom(scroller){let lastSig='',lastPos=-1,stableSince=0;for(let i=0;i<1200;i++){
      await scanCheckpoint();
      if(i%160===0&&i){const better=findScroller();if(better&&better!==scroller){scroller=better;stableSince=0;lastSig='';lastPos=-1;}}
      collectRecords();const max=Math.max(0,scrollHeightOf(scroller)-viewHeight(scroller)),cur=scrollPos(scroller),ratio=max?Math.min(1,cur/max):1;scanProgress(44+ratio*54,nt('scanSweep'));
      if(cur<max-8){setScrollPos(scroller,Math.min(max,cur+Math.max(360,viewHeight(scroller)*.68)));await sleep(120);stableSince=0;continue;}
      clickNativeBottom();await sleep(250);collectRecords();const st=bottomState(scroller),same=st.atBottom&&st.visible&&st.sig===lastSig&&Math.abs(st.pos-lastPos)<4;if(same){if(!stableSince)stableSince=Date.now();if(Date.now()-stableSince>=1800)break;}else stableSince=0;lastSig=st.sig;lastPos=st.pos;if(!st.atBottom)setScrollPos(scroller,st.max);
    }
    clickNativeBottom();const max=Math.max(0,scrollHeightOf(scroller)-viewHeight(scroller));setScrollPos(scroller,max);await sleep(420);collectRecords();const finalCheck=await confirmBottomStability(findScroller()||scroller,2600,14000);return finalCheck.ok;
  }
  async function scanFullChat(silent=false) {
    if(!hasConversationContent())return {count:0,complete:false,error:true,reason:'NO_CONVERSATION'};
    if(scanBusy)return {count:messageCache.size,complete:false,busy:true,paused:scanPaused};
    const scanKey=conversationKey(),priorSnapshot=lastFullScanSnapshot,priorKey=lastFullScanKey,priorValid=fullScanStillValid();
    scanBusy=true;scanPaused=false;scanCancelRequested=false;scanProgressValue=-1;activeScanConversationKey=scanKey;activeScanSeenKeys=new Set();syncNavigatorScanButton();
    let scroller=findScroller();const saved=scrollPos(scroller),anchor=captureScrollAnchor(scroller);let bottomFirst=false,topOk=false,bottomFinal=false;
    try{
      scanProgress(2,nt('scanBottom'));if(!silent)showNavToast(nt('scanBottom'));const bottomResult=await reachTrueBottom(scroller);bottomFirst=bottomResult.ok;scroller=bottomResult.scroller;
      if(!bottomFirst){if(!(priorValid&&priorKey===conversationKey()&&mountedMatchesSnapshot(priorSnapshot)))clearFullScanValidation();const text=nt('scanPartial',messageCache.size);scanProgress(100,text,true);if(!silent)showNavToast(text);if(silent)restoreScrollAnchor(scroller,anchor,saved);return {count:messageCache.size,complete:false,bottomFirst:false,topOk:false,bottomFinal:false};}
      scanProgress(25,nt('bottomReached'));if(!silent)showNavToast(nt('bottomReached'));const topResult=await reachTrueTop(scroller);topOk=topResult.ok;scroller=topResult.scroller;scanProgress(44,nt('scanSweep'));bottomFinal=topOk?await scanTopToBottom(scroller):false;
      const complete=!!(bottomFirst&&topOk&&bottomFinal);if(complete){await sleep(180);collectRecords();if(activeScanSeenKeys?.size){for(const key of [...messageCache.keys()])if(!activeScanSeenKeys.has(key))messageCache.delete(key);}lastFullScanKey=conversationKey();lastFullScanSnapshot=cacheValidationSnapshot();}else if(!(priorValid&&priorKey===conversationKey()&&mountedMatchesSnapshot(priorSnapshot))){clearFullScanValidation();}else{lastFullScanKey=priorKey;lastFullScanSnapshot=priorSnapshot;}const text=complete?nt('scanComplete',messageCache.size):nt('scanPartial',messageCache.size);scanProgress(100,text,true);if(!silent)showNavToast(text);
      if(silent)restoreScrollAnchor(scroller,anchor,saved);return {count:messageCache.size,complete,bottomFirst,topOk,bottomFinal};
    }catch(err){const code=String(err?.message||err),canceled=code==='SCAN_CANCELLED',routeChanged=code==='SCAN_ROUTE_CHANGED';if(priorValid&&!routeChanged&&priorKey===conversationKey()&&mountedMatchesSnapshot(priorSnapshot)){lastFullScanKey=priorKey;lastFullScanSnapshot=priorSnapshot;}else clearFullScanValidation();const text=canceled?`${nt('scanEnded')} · ${nt('processed',messageCache.size)}`:nt('scanEnded');scanProgress(100,text,true,canceled?'stopped':'idle');if(!silent)showNavToast(text);if(silent)restoreScrollAnchor(scroller,anchor,saved);return {count:messageCache.size,complete:false,error:!canceled,reason:routeChanged?'SCAN_ROUTE_CHANGED':undefined,canceled};}
    finally{await sleep(60);scanBusy=false;scanPaused=false;scanCancelRequested=false;activeScanConversationKey='';activeScanSeenKeys=null;syncNavigatorScanButton();refreshNavigator();}
  }

  function applyNavLayout() {
    if (!navShadow || !navLayout) return; const root=navShadow.getElementById('root'),panel=navShadow.getElementById('panel');
    if(Number.isFinite(navLayout.x)&&Number.isFinite(navLayout.y)){root.classList.add('custom');root.style.left=`${clamp(navLayout.x,6,innerWidth-50)}px`;root.style.top=`${clamp(navLayout.y,6,innerHeight-130)}px`;}
    if(navLayout.width) panel.style.width=`${clamp(navLayout.width,330,Math.min(innerWidth*.7,760))}px`; if(navLayout.height) panel.style.height=`${clamp(navLayout.height,360,innerHeight-28)}px`; positionPanel();
  }
  function positionPanel() {
    if(!navShadow) return; const root=navShadow.getElementById('root'),panel=navShadow.getElementById('panel'); const r=root.getBoundingClientRect(); panel.classList.toggle('open-right',r.left<innerWidth*.5);
    if(innerWidth>760){ const ph=Math.min(innerHeight-28,panel.getBoundingClientRect().height||720), desired=Math.max(8,Math.min(innerHeight-ph-8,r.top+r.height/2-ph/2)); panel.style.top=`${desired-r.top}px`; panel.style.transform='none'; }
  }
  function setupDrag() {
    const root=navShadow.getElementById('root'),grip=navShadow.getElementById('grip'); let active=false,dx=0,dy=0;
    grip.addEventListener('pointerdown',(e)=>{ if(e.button!==0)return; e.preventDefault(); const r=root.getBoundingClientRect(); active=true;dx=e.clientX-r.left;dy=e.clientY-r.top;root.classList.add('custom');grip.setPointerCapture?.(e.pointerId); });
    grip.addEventListener('pointermove',(e)=>{ if(!active)return; const x=clamp(e.clientX-dx,6,innerWidth-50),y=clamp(e.clientY-dy,6,innerHeight-130); root.style.left=`${x}px`;root.style.top=`${y}px`;navLayout={...(navLayout||{}),x,y};positionPanel(); });
    const done=async(e)=>{ if(!active)return;active=false;try{grip.releasePointerCapture?.(e.pointerId);}catch(_){}await saveNavLayout(); };
    grip.addEventListener('pointerup',done); grip.addEventListener('pointercancel',done); grip.addEventListener('dblclick',async()=>{navLayout=null;root.classList.remove('custom');root.style.left='';root.style.top='';await saveNavLayout();positionPanel();});
  }
  function setupResize() {
    if(typeof ResizeObserver==='undefined') return; const panel=navShadow.getElementById('panel'); let timer;
    navResizeObserver?.disconnect();
    navResizeObserver=new ResizeObserver(()=>{ if(!navOpen)return; clearTimeout(timer); timer=setTimeout(async()=>{ if(!panel.isConnected)return; const r=panel.getBoundingClientRect(); navLayout={...(navLayout||{}),width:Math.round(r.width),height:Math.round(r.height)}; await saveNavLayout(); },180); }); navResizeObserver.observe(panel);
  }

  function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer=setTimeout(()=>{syncRouteState();refreshNavigator();},260); }
  function loadSettings() {
    STORAGE_AREA.get(DEFAULTS, async (data) => { settings={...DEFAULTS,...(data||{})}; injectStyles(); await loadLocalState(); ensureNavigator(true); });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if(area!=='sync')return;let changed=false,navChanged=false,languageChanged=false;const wasOpen=navOpen;
    for(const key of Object.keys(DEFAULTS)){if(changes[key]){const next=changes[key].newValue;if(settings[key]===next)continue;settings[key]=next;changed=true;if(key==='navigatorEnabled')navChanged=true;if(key==='language')languageChanged=true;}}
    if(changed)injectStyles();if(navChanged||languageChanged){ensureNavigator(true);if(wasOpen&&settings.navigatorEnabled)setTimeout(()=>{if(!navOpen)toggleNavigator();},30);}
  });

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    if(!msg?.action)return;const run=async()=>{try{const options=normalizeExportOptions(msg.payload?.export||{});let count=0;if(msg.action==='copy_md')count=await copyMarkdown(options);else if(msg.action==='export_md')count=await exportMarkdown(options);else if(msg.action==='export_txt')count=await exportText(options);else if(msg.action==='export_pdf')count=await printConversation(options);else if(msg.action==='full_scan'){const result=await scanFullChat(false);if(result.reason){sendResponse({ok:false,error:result.reason});return;}if(result.busy){sendResponse({ok:false,error:result.paused?'SCAN_PAUSED':'SCAN_IN_PROGRESS'});return;}if(result.canceled){sendResponse({ok:true,canceled:true,count:result.count,complete:false,message:`${nt('scanEnded')} · ${nt('processed',result.count)}`});return;}sendResponse({ok:true,count:result.count,complete:result.complete,message:result.complete?nt('scanComplete',result.count):nt('scanPartial',result.count)});return;}else if(msg.action==='scroll_top'){window.scrollTo({top:0,behavior:'smooth'});sendResponse({ok:true});return;}else if(msg.action==='scan_pause'){if(scanBusy){setScanPaused(true);sendResponse({ok:true,paused:true,percent:scanProgressValue});}else sendResponse({ok:false,error:'NO_ACTIVE_SCAN'});return;}else if(msg.action==='scan_resume'){if(scanBusy){setScanPaused(false);sendResponse({ok:true,paused:false,percent:scanProgressValue});}else sendResponse({ok:false,error:'NO_ACTIVE_SCAN'});return;}else if(msg.action==='scan_cancel'){if(scanBusy){cancelScan();sendResponse({ok:true,percent:scanProgressValue});}else sendResponse({ok:false,error:'NO_ACTIVE_SCAN'});return;}else if(msg.action==='scan_status'){sendResponse({ok:true,busy:scanBusy,paused:scanPaused,percent:scanProgressValue,verified:fullScanStillValid()});return;}else if(msg.action==='navigator_status'){sendResponse({ok:true,open:!!navOpen,enabled:!!settings.navigatorEnabled});return;}else if(msg.action==='toggle_navigator'){if(!settings.navigatorEnabled){settings.navigatorEnabled=true;await syncSet({navigatorEnabled:true});ensureNavigator(true);await sleep(40);if(!navOpen)toggleNavigator();}else{ensureNavigator();toggleNavigator();}sendResponse({ok:true,open:!!navOpen,enabled:!!settings.navigatorEnabled});return;}else throw new Error('unknown-action');sendResponse({ok:true,count,message:nt('processed',count)});}catch(err){sendResponse({ok:false,error:String(err?.message||err)});}};run();return true;
  });

  document.addEventListener('pointerdown',(e)=>{if(!navOpen||!navHost)return;const path=e.composedPath?.()||[];if(path.includes(navHost)||e.target===navHost)return;closeNavigator();},true);

  document.addEventListener('keydown',(e)=>{
    if(e.altKey&&e.shiftKey&&e.key.toLowerCase()==='n'){
      e.preventDefault();
      if(!settings.navigatorEnabled){settings.navigatorEnabled=true;ensureNavigator(true);syncSet({navigatorEnabled:true}).catch(()=>{}); if(!navOpen)toggleNavigator();}
      else{ensureNavigator();toggleNavigator();}
      return;
    }
    if(!navOpen||!navShadow)return;
    const typing=e.target?.matches?.('input,textarea,[contenteditable="true"]');
    if(e.key==='Escape'){e.preventDefault();closeNavigator();}
    else if(e.key==='/'&&!typing){e.preventDefault();navShadow.getElementById('search')?.focus();}
  },true);
  window.addEventListener('scroll',()=>{ if(!navShadow||scrollRaf)return; scrollRaf=requestAnimationFrame(()=>{scrollRaf=0;currentQuestion=detectCurrentQuestion();const users=allRecords().filter(r=>r.role==='user');const count=navShadow?.getElementById('countBtn');if(count)count.textContent=`${users.length?currentQuestion+1:0}/${users.length}`;}); },{passive:true,capture:true});
  window.addEventListener('resize',()=>{applyNavLayout();positionPanel();},{passive:true});

  const observer=new MutationObserver((mutations)=>{
    const meaningful=mutations.some((m)=>{
      const t=m.target; if(!(t instanceof Node))return false;
      if(styleEl && (t===styleEl || styleEl.contains?.(t))) return false;
      if(navHost && (t===navHost || navHost.contains?.(t))) return false;
      if(scanStatusHost && (t===scanStatusHost || scanStatusHost.contains?.(t))) return false;
      return true;
    });
    if(meaningful){
      if(!scanBusy&&lastFullScanKey===conversationKey()){clearTimeout(observer.verifyTimer);observer.verifyTimer=setTimeout(()=>{if(lastFullScanKey===conversationKey()&&!mountedMatchesSnapshot(lastFullScanSnapshot))clearFullScanValidation();},180);}
      clearTimeout(floatingRepairTimer);floatingRepairTimer=setTimeout(repairFloatingControls,60);scheduleRefresh();
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:false});
  document.addEventListener('selectionchange',()=>{clearTimeout(repairFloatingControls.t);repairFloatingControls.t=setTimeout(repairFloatingControls,35);},{passive:true});
  document.addEventListener('pointerup',()=>{setTimeout(repairFloatingControls,20);setTimeout(repairFloatingControls,100);setTimeout(repairFloatingControls,260);},true);
  loadSettings();
})();
