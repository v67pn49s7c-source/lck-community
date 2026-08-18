// 운영 홈과 분리된 검토용 시안. 승인 전에는 index.html을 바꾸지 않는다.
renderHeader("홈", null);

const teamStrip = document.querySelector(".team-strip");
if (teamStrip) {
  const bar = document.createElement("section");
  bar.className = "preview-predict-bar";
  bar.setAttribute("aria-label", "오늘의 경기 예측");
  bar.innerHTML = `
    <div class="container preview-predict-inner">
      <div class="preview-predict-time">
        <span>오늘의 경기</span>
        <strong>8. 12. 수 · 2경기</strong>
      </div>
      <div class="preview-predict-list">
        <a class="preview-predict-game" href="predict.html" aria-label="17시 DNS 대 NS 승부 예측">
          <time>17:00</time>
          <span class="preview-predict-team"><span class="team-logo" style="width:26px;height:26px"><img src="assets/logos/dns.svg" alt=""></span><b>DNS</b></span>
          <span class="preview-predict-rate"><b>43%</b><i><span style="width:43%"></span></i><b>57%</b></span>
          <span class="preview-predict-team right"><b>NS</b><span class="team-logo" style="width:26px;height:26px"><img src="assets/logos/ns.svg" alt=""></span></span>
          <em>예측 ›</em>
        </a>
        <a class="preview-predict-game" href="predict.html" aria-label="19시 KT 대 DK 승부 예측">
          <time>19:00</time>
          <span class="preview-predict-team"><span class="team-logo" style="width:26px;height:26px"><img src="assets/logos/kt.svg" alt=""></span><b>KT</b></span>
          <span class="preview-predict-rate"><b>48%</b><i><span style="width:48%"></span></i><b>52%</b></span>
          <span class="preview-predict-team right"><b>DK</b><span class="team-logo" style="width:26px;height:26px"><img src="assets/logos/dk.svg" alt=""></span></span>
          <em>예측 ›</em>
        </a>
      </div>
    </div>`;
  teamStrip.before(bar);
}

renderFooter();

// 모바일은 상단 메뉴를 계정 영역으로, 하단 메뉴를 화면 이동용으로 역할 분리한다.
// MY는 상단의 "내 기록"으로 갈 수 있으므로 하단 마지막 칸은 선수·팀 탐색에 쓴다.
const previewLastTab = document.querySelector("#tab-bar a:last-child");
if (previewLastTab) {
  previewLastTab.href = "players.html";
  previewLastTab.setAttribute("aria-label", "선수·팀");
  previewLastTab.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle>
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0M13.5 20a4 4 0 0 1 7 0"></path>
    </svg>
    <span>선수·팀</span>`;
}
