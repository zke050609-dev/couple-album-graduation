let activeTripCinematic=null;

function tripCinematicMarkup(plan){
  const checklist=tripChecklist(plan),done=checklist.filter(item=>item.done).length,progress=tripProgress(plan);
  return `<div class="trip-cinematic-sky" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="trip-cinematic-route" aria-hidden="true"><span></span></div>
    <div class="trip-cinematic-arrow" aria-hidden="true">→</div>
    <div class="trip-cinematic-plane" aria-hidden="true">
      <img src="assets/travel-plane-pink.png" alt="">
      <span class="trip-cinematic-propeller"></span>
    </div>
    <div class="trip-cinematic-paper-stage">
      <article class="trip-cinematic-paper">
        <div class="trip-cinematic-paper-inner">
          <header><span>OUR TRAVEL PLAN</span><i>♡</i></header>
          <p>${esc(tripDateText(plan))}</p>
          <h3>${esc(plan.destination)}</h3>
          ${plan.wish?`<blockquote>“ ${esc(plan.wish)} ”</blockquote>`:''}
          <div class="trip-cinematic-progress"><span>准备进度 <b>${progress}%</b></span><i><em style="width:${progress}%"></em></i></div>
          <footer><span>${done}/${checklist.length} 项已准备</span><b>下一站见 ♡</b></footer>
        </div>
      </article>
    </div>
    <small class="trip-cinematic-skip">点击任意位置跳过</small>`;
}

function openTripPlanWithJourney(id){
  const plan=data.travelPlans.find(item=>item.id===id);if(!plan)return;
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return openTripPlan(id);
  activeTripCinematic?.finish(true);

  const trigger=document.activeElement?.closest?.('.trip-hero-copy button')||document.querySelector('.trip-hero-copy button');
  const rect=trigger?.getBoundingClientRect();
  const startX=rect?rect.right-6:innerWidth*.37;
  const startY=rect?rect.top+rect.height/2:innerHeight*.43;
  const overlay=document.createElement('div');
  overlay.className='trip-cinematic';
  overlay.setAttribute('role','presentation');
  overlay.innerHTML=tripCinematicMarkup(plan);
  document.body.appendChild(overlay);
  document.body.classList.add('trip-cinematic-active');

  const arrow=overlay.querySelector('.trip-cinematic-arrow');
  const plane=overlay.querySelector('.trip-cinematic-plane');
  const paper=overlay.querySelector('.trip-cinematic-paper');
  const route=overlay.querySelector('.trip-cinematic-route span');
  arrow.style.left=`${startX}px`;arrow.style.top=`${startY}px`;
  const vw=innerWidth,vh=innerHeight;
  const planeStartX=Math.min(vw-90,startX+145),planeStartY=startY-4;
  const animations=[];

  animations.push(arrow.animate([
    {opacity:1,transform:'translate3d(0,0,0) scale(1)'},
    {offset:.58,opacity:1,transform:'translate3d(92px,-3px,0) scale(1.15)'},
    {opacity:0,transform:'translate3d(148px,-7px,0) scale(.45)'}
  ],{duration:360,easing:'cubic-bezier(.22,.72,.25,1)',fill:'forwards'}));
  animations.push(route.animate([
    {opacity:0,transform:'scaleX(.02)'},
    {offset:.18,opacity:.75,transform:'scaleX(.18)'},
    {offset:.72,opacity:.62,transform:'scaleX(1)'},
    {opacity:0,transform:'scaleX(1)'}
  ],{duration:1380,delay:180,easing:'cubic-bezier(.2,.65,.28,1)',fill:'forwards'}));
  animations.push(plane.animate([
    {opacity:0,filter:'blur(2px) drop-shadow(0 5px 6px rgba(96,43,61,.16))',transform:`translate3d(${planeStartX}px,${planeStartY}px,-500px) translate(-50%,-50%) rotateY(65deg) rotateZ(-5deg) scale(.045)`},
    {offset:.12,opacity:1,filter:'blur(.7px) drop-shadow(0 9px 10px rgba(96,43,61,.2))',transform:`translate3d(${Math.min(vw*.88,vw-42)}px,${vh*.36}px,-290px) translate(-50%,-50%) rotateY(48deg) rotateZ(-13deg) scale(.19)`},
    {offset:.38,opacity:1,filter:'blur(0) drop-shadow(0 18px 18px rgba(96,43,61,.25))',transform:`translate3d(${vw*.69}px,${vh*.47}px,-80px) translate(-50%,-50%) rotateY(22deg) rotateZ(-9deg) scale(.52)`},
    {offset:.62,opacity:1,filter:'blur(0) drop-shadow(0 31px 26px rgba(70,33,48,.3))',transform:`translate3d(${vw*.48}px,${vh*.48}px,160px) translate(-50%,-50%) rotateY(-7deg) rotateZ(5deg) scale(1.08)`},
    {offset:.76,opacity:1,filter:'blur(.3px) drop-shadow(0 23px 21px rgba(70,33,48,.24))',transform:`translate3d(${vw*.28}px,${vh*.31}px,70px) translate(-50%,-50%) rotateY(-18deg) rotateZ(15deg) scale(.72)`},
    {opacity:0,filter:'blur(2.4px) drop-shadow(0 8px 12px rgba(70,33,48,.12))',transform:`translate3d(${-vw*.18}px,${-vh*.14}px,-160px) translate(-50%,-50%) rotateY(-34deg) rotateZ(24deg) scale(.28)`}
  ],{duration:1510,delay:245,easing:'cubic-bezier(.38,.02,.16,1)',fill:'both'}));
  animations.push(paper.animate([
    {opacity:0,transform:'translate3d(168px,-108px,170px) rotateX(72deg) rotateY(-18deg) rotateZ(12deg) scale(.12)'},
    {offset:.12,opacity:0,transform:'translate3d(168px,-108px,170px) rotateX(72deg) rotateY(-18deg) rotateZ(12deg) scale(.12)'},
    {offset:.28,opacity:1,transform:'translate3d(120px,-72px,115px) rotateX(55deg) rotateY(-12deg) rotateZ(9deg) scale(.28)'},
    {offset:.55,opacity:1,transform:'translate3d(42px,4px,34px) rotateX(18deg) rotateY(-5deg) rotateZ(-4deg) scale(.7)'},
    {offset:.77,opacity:1,transform:'translate3d(0,13px,0) rotateX(-4deg) rotateY(0) rotateZ(1.4deg) scale(1.025)'},
    {offset:.9,opacity:1,transform:'translate3d(0,-3px,0) rotateX(1deg) rotateY(0) rotateZ(-.45deg) scale(.995)'},
    {opacity:1,transform:'translate3d(0,0,0) rotateX(0) rotateY(0) rotateZ(0) scale(1)'}
  ],{duration:1120,delay:760,easing:'cubic-bezier(.16,.72,.2,1)',fill:'forwards'}));

  requestAnimationFrame(()=>overlay.classList.add('is-active','is-flying'));
  let finished=false,opened=false;
  const revealDetail=()=>{if(opened)return;opened=true;openTripPlan(id)};
  const handoffTimer=setTimeout(()=>{revealDetail();overlay.classList.add('is-handing-off')},1880);
  const endTimer=setTimeout(()=>finish(false),2160);
  function finish(skipped){
    if(finished)return;finished=true;clearTimeout(handoffTimer);clearTimeout(endTimer);
    if(skipped){animations.forEach(animation=>animation.cancel());revealDetail();overlay.classList.add('is-skipped')}
    else revealDetail();
    overlay.classList.add('is-leaving');
    setTimeout(()=>{overlay.remove();document.body.classList.remove('trip-cinematic-active');if(activeTripCinematic?.overlay===overlay)activeTripCinematic=null},skipped?100:280)
  }
  activeTripCinematic={overlay,finish};
  overlay.addEventListener('pointerdown',event=>{event.preventDefault();finish(true)},{once:true});
}

window.openTripPlanWithJourney=openTripPlanWithJourney;
