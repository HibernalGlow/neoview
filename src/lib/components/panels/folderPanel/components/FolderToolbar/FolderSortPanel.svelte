<script lang="ts">
/**v>
if}
</di
	{//if}		{
div>
			</tip.Root>ool			</T	ontent>
	</Tooltip.C
				页的排序</p>签页继承上一个标签	<p>新标				ntent>
	<Tooltip.Co				r>
	gerigtip.T	</Tool			
	utton>/B		<					继承
						>
				}
		t')y?.('inheriategetSortStr{() => onSonclick=							0px]"
ext-[1nded-full trou px-2 ="h-5			class		"
			size="sm					
	host'}'gault' :  ? 'deft' === 'inherigygs.stratertLockSettinnt={soaria		v					utton
					<Bger>
	.Trigip		<Tooltot>
			.Roltip				<Tootip.Root>
</Tool>
				tip.Content			</Tool）</p>
		称升序（名认排序	<p>新标签页使用默	
				tent>p.Conlti			<Too		er>
ooltip.Trigg	</T			Button>
						</	默认
					>
							)}
	default'gy?.('ortStratenSetSck={() => o	oncli					0px]"
	xt-[1teull 2 rounded-f5 px-lass="h-						c	e="sm"
iz		s					ost'}
'ghault' : ? 'default'  === 'defs.strategyttingSertLock	variant={so						Button
	<
					gger><Tooltip.Tri					>
oltip.Root	<To			 ml-1">
dow-innerl p-0.5 shauled-fap-0.5 roundter gs-cenlex item inline-f/60ted"bg-muv class=<diked}
			ettings.loc!sortLockS	{#if ） -->
	时显示选择（仅当未锁定 策略	<!--ot>

	RoTooltip.>
		</.Contentoltip</To			p>
定的排序方式</定后新标签页将使用锁xs">锁t-texreground uted-fo"text-mass=			<p cl</p>
	锁定当前排序'}排序' : '点击ked ? '点击解锁gs.locttinckSe{sortLo<p>				ntent>
ooltip.Co		<T>
	eriggooltip.Tr	</Tn>
				</Buttoif}
				{/
			h-3 w-3" />s="lasnlock c	<U					}
se			{:el" />
		h-3 w-3"<Lock class=				
		.locked}tingsckSetortLo		{#if s>
					)}
		ockedgs.linortLockSett.(!sed?cktLoor) => onSetS{(ck=		oncli}"
			0' : ''xt-amber-50ked ? 'telocngs.ockSettiortL6 w-6 {sh-ass="			cl"
		ze="icon			si
		ghost'}fault' : 'locked ? 'detings.Set{sortLock		variant=		n
	tto	<Buer>
			ggltip.Tri		<Tooip.Root>
	Toolt-->
		<	<!-- 锁定按钮 
		
	>ivx"></d w-p h-4 mx-1bg-border"class=<div ode}
		 !virtualM
	{#if拟模式） -->仅非虚排序锁定设置（-- t>

	<!ip.Roo</Tooltnt>
	p.ConteToolti
		</（点击切换）</p>'升序' : '降序'}c' ? der === 'asnfig.or	<p>{sortCo>
		tent.Con		<Tooltiper>
riggltip.TToo
		</n>to
			</But	{/if}/>
			3" ="h-3 w-n classowrowD			<Ar		lse}
{:e				-3" />
="h-3 w classUp		<Arrow		sc'}
	'arder === .oortConfigif s
				{#		>rder}
	ggleSortOlick={onTonc		o"
		"h-6 w-6		class=	"
	ze="icon
				sit"iant="ghosar				vn
uttor>
			<Boltip.Trigget>
		<Toooltip.Roo>
	
	<T}
	</div
		{/eachoot>oltip.R			</Tot>
.ContenTooltip	</		
	''}</p> : ' ↓') :  ↑' 'asc' ? 'der ===.origtConf(sor.value ? d === fieldg.fielnfiortCoel}{s.labld>{fie	<p>
				ltip.Content				<Too.Trigger>
/Tooltip	<	on>
		utt			</B		-3" />
ass="h-3 wIcon cl			<	>
					alue)}
		.(field.vtSort?> onSenclick={() =	o				"
	llounded-fu w-6 r="h-6		class			"
	e="icon			siz
			 'ghost'}default' :? 'eld.value eld === fionfig.fit={sortC			varian		Button
			<			
p.Trigger>lti		<Toooot>
		.Rooltip	<T}
		conield.i = f{@const Icon
			d}elds as fielch sortFi	{#eainner">
	ow-p-0.5 shadunded-full .5 rocenter gap-0ex items-0 inline-fled/6-mut"bgdiv class=n>
	<">排序</spa mr-1ext-xsoreground tted-fmu="text-an class	<sp py-1">
px-250 der-border/border-t bor-1 r gaps-centeex-wrap item"flex fl
<div class=序展开面板 -->
<!-- 排</script>
elds());
tFiSor$derived(getFields = 

let sort];
}}
	: Heart 藏标签', iconl: '收tField, labelderSor' as FoctTagCount: 'colle{ value		
 Star },icon:l: '评分', tField, labeorderS Fol'rating' asvalue: 		{ fle },
Shufcon: el: '随机', id, labderSortFielom' as Follue: 'rand va},
		{ FileType n:'类型', icolabel: ortField, erSFoldpe' as tyalue: '{ v	,
	rive }dD, icon: Harel: '大小' labield,rSortFas Foldelue: 'size' 	{ va	
dar }, Calenel, icon:teLabd, label: daSortFiel as Folderate'{ value: 'd
		derTree }, Fol icon:','路径 label: Field,olderSortth' as F 'pa	{ value:l },
	rgeSmal: ALacon', ilabel: '名称SortField, lder as Folue: 'name'
		{ va	return ['日期';
 ? '添加时间' : ualModeabel = virt	const dateL {
()ldsFie getSorttion
 */
func"时间添加e 显示为" dat拟模式下排序字段列表
 * 虚
/**
 * 获取rops();
 Props = $pegy
}:ratStrt	onSetSotLocked,
etSor	onSrder,
oggleSortOnT	ort,
SetSogs,
	onttinrtLockSe	so,
figsortCon
	ll,ualMode = nu
	virt
let { void;
}
Strategy) =>Inheritgy: Sort?: (strateSortStrategyet回调 */
	onS设置排序继承策略
	/** ;id=> voean) boollocked: ked?: (nSetSortLoc/
	o序锁定状态回调 *
	/** 设置排void;der?: () => oggleSortOr调 */
	onT	/** 切换排序顺序回 => void;
d)rSortFielld: Foldert?: (fie/
	onSetSo字段回调 *	/** 设置排序ngs;
titSetredSorShakSettings: 
	sortLoc*/置 定设* 排序锁/*c' };
	' | 'dessc'ar: tField; orderSorld: Folde { fieonfig:
	sortC** 当前排序配置 */| null;
	/ory'  | 'hist'bookmark': rtualMode?	vi的排序标签 */
模式类型，用于显示正确** 虚拟 {
	/erface Props

intHeart
};nt: gCoucollectTatar,
	ing: Satfle,
	rm: Shuf	randoeType,
Fil
	type: dDrive,e: Harsiz
	alendar,e: C
	datlderTree,	path: Fo
ll,mageSLar	name: A{
= LargeSmall> f Ald, typeotFieSorcord<Foldercons: ReeldIonst sortFi射
c排序字段图标映

// abStore';rTdes/foltore../../srom ' } feritStrategyortInhtSettings, S { SharedSor typemport;
ivelte're.srPanelStoldefo/../stores/m '..ield } frorSortFype { Foldet tip';
impor/tooltents/uiib/componip from '$l as Tooltort *mp
iutton';ponents/ui/b$lib/com 'from } { Button';
import velte@lucide/s
} from 'Tree
	Foldert,
	Hearar,
	Stffle,pe,
	Shu,
	FileTyrive
	HardDr,ndal,
	CalegeSmal	ALar排序图标

	// 	Unlock,ck,
Loown,
	p,
	ArrowD {
	ArrowU */
import置
、排序锁定设段选择、排序顺序切换件
 * 包含：排序字- 文件夹排序面板子组tPanel lderSor
 * Fo