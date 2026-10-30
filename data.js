window.ARCHIVE_ITEMS = [
  {
    id: 'travel', title: '여행 한 장', category: 'app',
    tagline: '적어 둔 여행이, 하나의 지도가 되도록.',
    summary: '메모장에 흩어져 있던 여행 일정을 도트 지도 위에 펼쳐 보는 아이디어예요. 큰 지도에서 여정을 바라보다가 하루를 선택하면, 방문할 장소와 이동 순서가 가까이 들어옵니다.',
    status: '조작 시안', theme: '#e6eef0', cover: 'assets/travel.webp', demo: 'demos/travel/', video: null,
    features: ['메모로 일정을 적고 지도에서 확인하기', '날짜별 장소와 이동 순서 살펴보기', '도트 지도 위에서 하루의 동선 재생하기'],
    note: '공개 관광지를 사용한 예시 시안입니다. 실제 메모 자동 분석·길찾기·예약 연동은 준비 전이에요.', updated: '2026-10-30'
  },
  {
    id: 'musubi', title: 'MUSUBI', category: 'app',
    tagline: '우리 사이의 거리, 한 가닥의 실로.',
    summary: '가까워지면 팽팽해지고, 멀어지면 느슨해지는 붉은 실. 숫자로만 보던 둘 사이의 거리를 작은 움직임으로 느껴 보는 앱을 생각했어요.',
    status: '조작 시안', theme: '#111a30', cover: 'assets/musubi.webp', demo: 'demos/musubi/', video: 'assets/musubi.mp4',
    features: ['거리 변화에 따라 달라지는 실의 움직임', '상대와 연결되는 초대 흐름', '작고 조용한 화면에서 관계의 거리 느끼기'],
    note: '이 웹 시안의 거리·초대·위치는 예시입니다. 실제 GPS 공유나 iPhone 다이나믹 아일랜드 연동을 보여주는 화면은 아니에요.', updated: '2026-10-30'
  },
  {
    id: 'bottle', title: '표류', category: 'app',
    tagline: '한국과 일본 사이, 하루 세 줄.',
    summary: '한국과 일본 어딘가의 사람과 익명으로 하루 세 줄을 나누는 교환일기. 코르크 마개 유리병에 담은 편지가 거리에 따라 천천히 도착하고, 지도에서 그 여정을 바라봅니다.',
    status: '조작 시안', theme: '#e1ece8', cover: 'assets/bottle.webp', demo: 'demos/bottle/', video: null,
    features: ['하루를 세 줄로 적어 병에 담기', '지도 위에서 천천히 흐르는 병 바라보기', '거리에 따른 기다림과 익명 교환일기'],
    note: '보내기와 지도는 예시 동작입니다. 실제 상대 매칭·편지 전송·해류 데이터 연동은 아직 없어요.', updated: '2026-10-30'
  },
  {
    id: 'japanese', title: '써서 찾는 일본어', category: 'app',
    tagline: '모르는 표현을, 화면 가득 쓰면.',
    summary: '모의고사에서 만난 한자와 변형된 표현을 iPad에 그대로 쓰고 찾아보는 사전 아이디어예요. 작은 필기 칸 대신 화면 전체를 쓰고, 아래에서 뜻과 기본형을 이어서 확인합니다.',
    status: '필기 시안', theme: '#eeeae3', cover: 'assets/japanese.webp', demo: 'demos/japanese/', video: null,
    features: ['큰 화면 전체에 직접 손글씨 쓰기', '결과에서 뜻과 읽는 법·기본형 확인하기', '단어뿐 아니라 표현과 활용형으로 검색하기'],
    note: '획 입력은 작동하지만 검색 결과는 미리 준비한 예시입니다. 필기 인식·사전·AI API는 연결 전이에요.', updated: '2026-10-30'
  },
  {
    id: 'eraser', title: '증강 지우개 따먹기', category: 'game',
    tagline: '한 번의 착지로, 내 것이 되는 순간.',
    summary: '내 지우개를 뒤집어 상대 위에 포개면 한 점. ROUNDS를 참고해 다섯 카드 중 하나를 고르고, 진 쪽이 추가 능력을 얻어 반격하는 게임이에요. 모은 카드의 효과는 경기 끝까지 쌓입니다.',
    status: '플레이 시안', theme: '#f1dfc5', cover: 'assets/eraser.webp?v=rounds-1', demo: 'demos/eraser/', video: null,
    features: ['다섯 카드 중 하나를 골라 능력 쌓기', '라운드에서 진 쪽만 추가 카드 선택하기', '양쪽 빌드를 보며 먼저 세 번 포개기'],
    note: '한 기기에서 연습 상대와 플레이할 수 있습니다. 온라인 친구 대전·계정·매칭은 구현 전이에요.', updated: '2026-10-30'
  },
  {
    id: 'nooprun', title: '눕런', category: 'app',
    tagline: '아무것도 안 한 시간도, 나의 기록.',
    summary: '누워서 푹 쉰 시간을 러닝 완주 기록처럼 남겨 보면 어떨까요. 쉬는 시간을 재고, 오늘의 빈둥 기록을 카드 한 장으로 만드는 가벼운 패러디 앱이에요.',
    status: '조작 시안', theme: '#e9e5f0', cover: 'assets/nooprun.webp', demo: 'demos/nooprun/', video: null,
    features: ['누운 순간부터 쉬는 시간 재기', '이번 휴식의 기록 확인하기', '내 빈둥 기록을 카드로 남기기'],
    note: '타이머와 기록을 체험하는 웹 시안입니다. 실제 달리기나 GPS 거리를 측정하는 앱은 아니에요.', updated: '2026-10-30'
  },
  {
    id: 'teru', title: '테루테루보즈', category: 'app',
    tagline: '내일은 맑기를, 같은 곳에서 바라는 마음.',
    summary: '소풍 갈 공원, 좋아하는 축제, 내일의 약속 장소. 그곳이 맑기를 바라는 사람들이 지도에 작은 테루테루보즈를 하나씩 걸어 두는 공동 기원 지도를 구상했어요.',
    status: '기획', theme: '#e4eff5', cover: 'assets/teru.svg', demo: null, video: null,
    features: ['내일 맑기를 바라는 장소 선택하기', '작은 인형에 짧은 바람 남기기', '같은 장소를 기다리는 마음들 모아 보기'],
    note: '기획 단계입니다. 실제 날씨를 바꾸는 기능이 아니라, 같은 장소를 기대하는 마음을 표현하는 아이디어예요.', updated: '2026-10-30'
  },
  {
    id: 'next-photo', title: '다음장', category: 'app',
    tagline: '네 사진의 다음은, 내 눈앞에 있어.',
    summary: '앞사람이 찍은 사진의 색이나 모양을 단서로 내 주변의 다음 사진을 찍습니다. 서로 다른 일상이 하나의 사진 릴레이로 이어지는 앱을 구상했어요.',
    status: '기획', theme: '#f2e6dd', cover: 'assets/next-photo.svg', demo: null, video: null,
    features: ['이전 사진에서 색·모양 단서 발견하기', '지금 눈앞의 장면으로 이어 찍기', '함께 이어진 사진의 흐름 돌아보기'],
    note: '가칭·기획 단계입니다. 카메라·사진 업로드·사용자 간 릴레이는 아직 구현하지 않았어요.', updated: '2026-10-30'
  },
  {
    id: 'inventory', title: '16×16 인벤토리', category: 'app',
    tagline: '오늘 발견한 물건, 작은 아이템 하나.',
    summary: '길에서 발견한 물건을 찍으면 16×16 픽셀 아이템이 되어 인벤토리에 들어옵니다. 사진 전체에 필터를 씌우기보다, 사물의 특징을 작은 아이템 한 개로 남기는 수집 앱이에요.',
    status: '기획', theme: '#e8eddf', cover: 'assets/inventory.svg', demo: null, video: null,
    features: ['주변에서 눈에 들어온 사물 촬영하기', '검은 윤곽선의 작은 픽셀 아이템으로 담기', '나만의 발견을 인벤토리에 모으기'],
    note: '가칭·기획 단계입니다. 사진 인식·아이템 변환·보관함은 아직 구현하지 않았어요.', updated: '2026-10-30'
  }
];
