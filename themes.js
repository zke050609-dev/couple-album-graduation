const siteThemeOptions=[
  {id:'pink',name:'白粉',flower:'樱花'},
  {id:'orange',name:'白橙',flower:'金盏菊'},
  {id:'green',name:'白绿',flower:'爱尔兰风铃草'},
  {id:'blue',name:'白蓝',flower:'喜林草'},
  {id:'purple',name:'白紫',flower:'薰衣草'}
];

function normalizedSiteTheme(){return siteThemeOptions.some(item=>item.id===data.theme)?data.theme:'pink'}
function applySiteTheme(){
  document.body.dataset.theme=normalizedSiteTheme();
  document.body.dataset.page=currentPage||'home';
}
function siteThemeSettingsCard(){
  const selected=normalizedSiteTheme();
  return `<article class="setting-card site-theme-card"><h3>网站基础色调</h3><p>登录后的首页与全部功能页面都会使用选中的淡色主题和花卉背景；密码界面始终保持原来的白粉色。</p><div class="site-theme-options">${siteThemeOptions.map(item=>`<label class="site-theme-option theme-${item.id}"><input type="radio" name="site-theme" value="${item.id}" ${selected===item.id?'checked':''}><span class="site-theme-preview"><i></i></span><b>${item.name}</b><small>${item.flower}</small></label>`).join('')}</div><button class="secondary site-theme-save" onclick="saveSiteTheme()">保存基础色调</button></article>`;
}
async function saveSiteTheme(){
  const selected=document.querySelector('input[name="site-theme"]:checked')?.value||'pink';
  data.theme=siteThemeOptions.some(item=>item.id===selected)?selected:'pink';
  if(!await saveFormDraft(document.querySelector('.site-theme-card')))return;
  render();
  toast(`已换成${siteThemeOptions.find(item=>item.id===data.theme).name}主题 ♡`);
}

const siteThemeBaseSettings=settings;
settings=function(){return siteThemeBaseSettings().replace('<div class="settings">',`<div class="settings">${siteThemeSettingsCard()}`)};
const siteThemeBaseRender=render;
render=function(){const result=siteThemeBaseRender();applySiteTheme();return result};
window.saveSiteTheme=saveSiteTheme;
applySiteTheme();
