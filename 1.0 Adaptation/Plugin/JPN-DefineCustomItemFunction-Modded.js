
/*-----------------------------------------------------------------------------------------------
  
  カスタムアイテム用の関数ライブラリ
	
  作成者:
  o-to
  
  更新履歴:
  2015/10/11：範囲攻撃アイテムの新規作成(試作型)
  2015/10/13：範囲指定や付加ステータスなど様々な要素を追加
  2015/10/16：公式アップデート1.035に対応するように修正
  2015/10/31：スキルの状態異常無効に対応、敵AIを改善
			  ダメージ数値の表示追加、ダメージエフェクトやユニット消滅を同時に再生するよう修正
			  ステート付与時のアニメをステートのマップアニメに依存するよう修正
			  マップ地形変更効果を追加
			  使用時のダメージを敵のダメージと一緒に行うよう変更
  2015/12/04：最新バージョンではエラーで終了してしまうため修正
			  ツール側のアニメーション再生に対応
  2016/05/03:
  補助オンリー(固定ダメージor固定回復量が0)の場合はダメージ表示とHP回復量の表示が省略されるように修正
  敵AIの行動決定に使用するスコアに倍率を設定可能に
  使用時ダメージにマイナス指定を行うとHP回復するように修正
  与えたダメージのHP吸収率を設定可能に

  2016/10/17:
  威力の補正に各ステータスの値が影響する設定ができるように修正
  最終的な攻撃力に補正値を掛ける設定を追加
  一部誤字修正
  
  2017/01/29:
  ステート付与時のエラー対応にて未使用だったOT_setCustomItemAddStateも念のため修正

  2019/07/07:
  エディタ側でステートのデータを削除してIDが歯抜け状態になっている状態で
  カスパラのIER_DelStateかOT_UseDelStateに'BadState'か'GoodState'を指定した
  アイテムにカーソルを合わせるとエラーになる問題を修正。
  OT_UseAddStateとIER_AddStateに対応していない'BadState'か'GoodState'、'AllState'を指定したアイテムに
  カーソルを合わせた時のエラーメッセージを指定しないで欲しい旨の警告が出て終了するように修正

  2019/10/06:
  OT_UnitReflectionをtrueにしてユニット能力を威力に反映するようにした時、
  「支援効果」による攻撃の補正値が参照されるよう修正。
  ダメージタイプが物理、魔法の場合に「支援効果」による防御の補正値が参照されるよう修正。
  支援効果の攻撃・防御・命中・回避の影響を受けるかどうかをカスパラで設定可能に修正（それぞれのデフォルトはtrue）。

-----------------------------------------------------------------------------------------------*/

// 範囲タイプ
OT_EffectRangeType = {
	  NORMAL:0
	, CROSS:1
	, XCROSS:2
	, DOUBLECROSS:3
	, LINE:4
	, HORIZONTALLINE:5
	, BREATH:6
};

// ステータスの定義定数
OT_DefineStatus = {
	  LV : 'LV'
	, HP : 'HP'
	, EP : 'EP'
	, FP : 'FP'
};

// 現在値と最大値が分かれているパラメータの紐づけ配列
OT_NowStatusMapping = {
	  MHP : 'HP'
	, MEP : 'EP'
	, MFP : 'FP'
};

OT_SLANTING = 100;

// 効果範囲実装用の発動箇所選択オブジェクト
var OT_EffectRangePosSelector = defineObject(PosSelector,
{
	item:null,
/*
	initialize: function() {
		PosSelector.initialize.call(this);

		// メニュー
		this._posMenu = createObject(OT_EffectRangePosMenu);
	},
*/	
	setUnitOnly: function(unit, item, indexArray, type, filter) {
		this._unit = unit;
		this._indexArray = indexArray;
		this._filter = filter;
		this.item = item;
		MapLayer.getMapChipLight().setIndexArray(indexArray);
		this._setPosMenu(unit, item, type);
		this._posCursor = createObject(this._getObjectFromType(this._selectorType));
		this._posCursor.setParentSelector(this);
	},

	_getDefaultSelectorType: function() {
		return PosSelectorType.FREE;
	},
	
	movePosSelector: function() {
		var result = PosSelectorResult.NONE;
		
		if (InputControl.isSelectAction()) {
			this._playSelectSound();
			result = PosSelectorResult.SELECT;
		}
		else if (InputControl.isCancelAction()) {
			this._playCancelSound();
			result = PosSelectorResult.CANCEL;
		}
		else {
			this._posCursor.checkCursorEffectRange();
		}
		
		return result;
	},

	getSelectorTarget: function(isIndexArray) {
		var unit = this._mapCursor.getUnitFromCursor();
		
		return unit;
	},

	endPosSelector: function() {
		MapLayer.getMapChipLight().endLight();
		MapLayer.OT_getEffectRangePanel().endLight();
	}

}
);

// 効果範囲実装用の範囲生成オブジェクト
var OT_EffectRangeIndexArray = {
	createIndexArray: function(x, y, item) {
		var i, rangeValue, rangeType, arr;
		var startRange = 0;
		var endRange = 1;
		var count = 1;

		rangeValue = item.getRangeValue();
		rangeType = item.getRangeType();

		if (rangeType === SelectionRangeType.SELFONLY) {
			endRange = 0;
		}
		else if (rangeType === SelectionRangeType.MULTI) {
			endRange = rangeValue;
		}
		else if (rangeType === SelectionRangeType.ALL) {
			endRange = CurrentMap.getWidth() + CurrentMap.getHeight();
		}

		if( typeof item.custom.OT_MinRange === 'number' )
		{
			startRange = item.custom.OT_MinRange;
		}
		
		if( startRange > endRange )
		{
			startRange = endRange;
		}

		var RangeType = OT_getCustomItemRangeType(item);
		
		return this.getRangeIndexArray(x, y, startRange, endRange, RangeType, OT_getCustomItemRangeSpread(item));
	},
	
	getBestIndexArray: function(x, y, startRange, endRange) {
		var simulator = root.getCurrentSession().createMapSimulator();
		
		simulator.startSimulationRange(x, y, startRange, endRange);
		
		return simulator.getSimulationIndexArray();
	},

	getEffectRangeItemIndexArray: function(x, y, item, unit) {
		var startRange = OT_getCustomItemEffectRangeMin(item);
		var endRange = OT_getCustomItemEffectRangeMax(item);
		var effectRangeType = OT_getCustomItemEffectRangeType(item);
		var spread = OT_getCustomItemEffectSpread(item);

		return this.getEffectRangeIndexArray( x, y, startRange, endRange, effectRangeType, spread, unit.getMapX(), unit.getMapY() );
	},
	
	getEffectRangeItemIndexArrayPos: function(x, y, item, px, py) {
		var startRange = OT_getCustomItemEffectRangeMin(item);
		var endRange = OT_getCustomItemEffectRangeMax(item);
		var effectRangeType = OT_getCustomItemEffectRangeType(item);
		var spread = OT_getCustomItemEffectSpread(item);

		return this.getEffectRangeIndexArray( x, y, startRange, endRange, effectRangeType, spread, px, py );
	},

	getAIEffectRangeItemIndexArray: function(x, y, item) {
		var endRange = OT_getCustomItemEffectRangeMax(item);
		var startRange = OT_getCustomItemEffectRangeMin(item);
		var effectRangeType = OT_getCustomItemEffectRangeType(item);
		var spread = OT_getCustomItemEffectSpread(item);

		return this.getAIEffectRangeIndexArray( x, y, startRange, endRange, effectRangeType, spread );
	},

	getAIEffectRangeItemIndexArray2: function(x, y, item) {
		var endRange = OT_getCustomItemEffectRangeMax(item);
		var startRange = endRange;
		var effectRangeType = OT_getCustomItemEffectRangeType(item);
		var spread = OT_getCustomItemEffectSpread(item);

		if( startRange < 0 ) startRange = 0;

		return this.getAIEffectRangeIndexArray( x, y, startRange, endRange, effectRangeType, spread );
	},
		
	getRangeIndexArray: function(x, y, startRange, endRange, effectRangeType, spread) {
		var IndexArray = null;

		switch( effectRangeType )
		{
			case OT_EffectRangeType.CROSS:
				IndexArray = OT_getCrossIndexArray(x, y, startRange, endRange, spread);
				root.log("HELP1")
				break;
			
			case OT_EffectRangeType.XCROSS:
				IndexArray = OT_getXCrossIndexArray(x, y, startRange, endRange, spread);
				root.log("HELP2")
				break;

			case OT_EffectRangeType.DOUBLECROSS:
				IndexArray = OT_getDoubleCrossIndexArray(x, y, startRange, endRange, spread);
				root.log("HELP3")
				break;
			
			default:
				var simulator = root.getCurrentSession().createMapSimulator();
				simulator.startSimulationRange(x, y, startRange, endRange);
				IndexArray = simulator.getSimulationIndexArray();
				root.log("HELP4")
				//IndexArray = OT_getLineIndexArray(x, y, startRange, endRange, 0);
				break;
		}
		//root.log(ERType);
		root.log(IndexArray.length)
		return IndexArray;
	},
	
	getEffectRangeIndexArray: function(x, y, startRange, endRange, effectRangeType, spread, unit_x, unit_y) {
		var IndexArray = null;
		var direction = OT_getUnitDirection(unit_x, unit_y, x, y);

		switch( effectRangeType )
		{
			case OT_EffectRangeType.CROSS:
				IndexArray = OT_getCrossIndexArray(x, y, startRange, endRange, spread);
				break;
			
			case OT_EffectRangeType.XCROSS:
				IndexArray = OT_getXCrossIndexArray(x, y, startRange, endRange, spread);
				break;

			case OT_EffectRangeType.DOUBLECROSS:
				IndexArray = OT_getDoubleCrossIndexArray(x, y, startRange, endRange, spread);
				break;
			
			case OT_EffectRangeType.LINE:
				if( direction >= OT_SLANTING )
				{
					IndexArray = OT_getDiagonalIndexArray(x, y, startRange, endRange, direction - OT_SLANTING, spread);
				}
				else if( direction != -1)
				{
					IndexArray = OT_getLineIndexArray(x, y, startRange, endRange, direction, spread);
				}
				else
				{
					IndexArray = {};
				}
				break;

			case OT_EffectRangeType.HORIZONTALLINE:
				if( direction >= OT_SLANTING )
				{
					IndexArray = OT_getDiagonalHorizontalLineIndexArray(x, y, startRange, endRange, direction - OT_SLANTING, spread);
				}
				else if( direction != -1)
				{
					IndexArray = OT_getHorizontalLineIndexArray(x, y, startRange, endRange, direction, spread);
				}
				else
				{
					IndexArray = {};
				}
				break;

			case OT_EffectRangeType.BREATH:
				if( direction >= OT_SLANTING )
				{
					//IndexArray = OT_getDiagonalBreathIndexArray(x, y, startRange, endRange, direction - OT_SLANTING, spread);
					IndexArray = {};
				}
				else if( direction != -1)
				{
					IndexArray = OT_getBreathIndexArray(x, y, startRange, endRange, direction, spread);
				}
				else
				{
					IndexArray = {};
				}
				break;

			default:
				var simulator = root.getCurrentSession().createMapSimulator();
				simulator.startSimulationRange(x, y, startRange, endRange);
				IndexArray = simulator.getSimulationIndexArray();
				
				//IndexArray = OT_getLineIndexArray(x, y, startRange, endRange, 0);
				break;
		}
		//root.log(ERType);
		return IndexArray;
	},

	getAIEffectRangeIndexArray: function(x, y, startRange, endRange, effectRangeType, spread) {
		var IndexArray = null;

		switch( effectRangeType )
		{
			case OT_EffectRangeType.CROSS:
			case OT_EffectRangeType.HORIZONTALLINE:
				IndexArray = OT_getCrossIndexArray(x, y, startRange, endRange, spread);
				break;
			
			case OT_EffectRangeType.XCROSS:
				IndexArray = OT_getXCrossIndexArray(x, y, startRange, endRange, spread);
				break;

			case OT_EffectRangeType.LINE:
			case OT_EffectRangeType.DOUBLECROSS:
				IndexArray = OT_getDoubleCrossIndexArray(x, y, startRange, endRange, spread);
				break;
			
			case OT_EffectRangeType.BREATH:
				IndexArray = OT_getAllBreathIndexArray(x, y, startRange, endRange, spread);
				break;

			default:
				var simulator = root.getCurrentSession().createMapSimulator();
				simulator.startSimulationRange(x, y, startRange, endRange);
				IndexArray = simulator.getSimulationIndexArray();
				
				break;
		}
		//root.log(ERType);
		return IndexArray;
	},
		
	findUnit: function(indexArray, targetUnit) {
		var i, index, x, y;
		var count = indexArray.length;
		
		if (count === CurrentMap.getSize()) {
			return true;
		}
		
		for (i = 0; i < count; i++) {
			index = indexArray[i];
			x = CurrentMap.getX(index);
			y = CurrentMap.getY(index);
			if (PosChecker.getUnitFromPos(x, y) === targetUnit) {
				return true;
			}
		}
		
		return false;
	},
	
	findPos: function(indexArray, xTarget, yTarget) {
		var i, index, x, y;
		var count = indexArray.length;
		
		if (count === CurrentMap.getSize()) {
			return true;
		}
		
		for (i = 0; i < count; i++) {
			index = indexArray[i];
			x = CurrentMap.getX(index);
			y = CurrentMap.getY(index);
			if (x === xTarget && y === yTarget) {
				return true;
			}
		}
		
		return false;
	}
};

(function() {

var alias0 = PosFreeCursor.checkCursor;
PosFreeCursor.checkCursorEffectRange = function() {
	alias0.call(this);
	
	var item = this._parentSelector.item;
	var unit = this._parentSelector._unit;

	if( this._parentSelector.getSelectorPos(true) )
	{
		var indexArray = OT_EffectRangeIndexArray.getEffectRangeItemIndexArray(this._xPrev, this._yPrev, item, unit);
		MapLayer.OT_getEffectRangePanel().setIndexArray(indexArray);
	}
	else
	{
		MapLayer.OT_getEffectRangePanel().endLight();
	}
};

/*
var alias1 = PosItemWindow.drawInfoCenter;
PosItemWindow.drawInfoCenter = function(xBase, yBase) {
	alias1.call(this, xBase, yBase);

	var x, y;
	var item = this._item;
	var textui = this.getWindowTextUI();
	var color = textui.getColor();
	var font = textui.getFont();
	
	if (item !== null && item.isWeapon() == false) {
		if( item.getCustomKeyword() == 'OT_ItemEffectRange' )
		{
			x = xBase;
			y = yBase + 90;
			TextRenderer.drawKeywordText(x, y, 'テスト', -1, color, font);
		}
	}
};
*/

//----------------------------------------------------------
// 共通で使用できるそうなもの
//----------------------------------------------------------
// 使用時のダメージで死亡するかの設定を取得
OT_getUseDamageDeath = function(item) {
	var value = true;
	if( typeof item.custom.OT_UseDamageDeath === 'boolean' )
	{
		value = item.custom.OT_UseDamageDeath;
	}

	return value;
};

// 吸収ダメージの倍率を取得
OT_getAbsorptionRate = function(item) {
	var value = 0.0;
	if( typeof item.custom.OT_AbsorptionRate === 'number' )
	{
		value = item.custom.OT_AbsorptionRate;
	}

	return value;
};

// 吸収ダメージの倍率を算術した値を取得
OT_getAbsorptionRateValue = function(item, value) {
	var point = Math.floor(value * OT_getAbsorptionRate(item));
	
	return point;
};

// AIのスコアレートを取得
OT_getAIScoreRate = function(item) {
	var value = 1.0;
	if( typeof item.custom.OT_AIScoreRate === 'number' )
	{
		value = item.custom.OT_AIScoreRate;
	}

	return value;
};

// AIのスコアレートを算術した値を取得
OT_getAIScoreRateValue = function(item, value) {
	var score = Math.floor(value * OT_getAIScoreRate(item))
	
	return score;
};

// アイテムのタイプを取得
OT_getCustomItemType = function(item) {
	var damageType = item.custom.OT_DamageType;
	
	if (typeof damageType !== 'number' || damageType >= 3) {
		damageType = DamageType.FIXED;
	}
	return damageType;
};

// ユニットの攻撃力を取得
OT_getCustomItemValue = function(unit, item) {
	var reflection = item.custom.OT_UnitReflection;
	var plus = 0;
	var unitTotalStatus = SupportCalculator.createTotalStatus(unit);

	if(reflection == true) {
		plus = OT_getCustomItemStatueReflection(unit, item);
		if(OT_getCustomItemCheckSupportAtk(item) == true) {
			plus += SupportCalculator.getPower(unitTotalStatus);
		}
	}
	
	return plus;
};

// ダメージ倍率を取得
OT_getCustomItemDamageMagnification = function(item) {
	var val = item.custom.OT_DamageMagnification;
	
	if (typeof val !== 'number') {
		val = 1.0;
	}
	return val;
};

// ステータスによる攻撃力ボーナスを加算
OT_getCustomItemStatueReflection = function(unit, item) {
	var unitTotalStatus = SupportCalculator.createTotalStatus(unit);
	var val = item.custom.OT_StatueReflection;
	var plus = 0;

	if(val == null) {
		//root.log('OT_StatueReflection未設定');
		var damageType = OT_getCustomItemType(item);
		if (damageType === DamageType.PHYSICS) {
			plus = ParamBonus.getStr(unit);
		} else if (damageType === DamageType.MAGIC) {
			plus = ParamBonus.getMag(unit);
		}
	} else {
		//root.log('OT_StatueReflection設定済');
		for( var key in val )
		{
			if( typeof val[key] === 'number' )
			{
				var stateValue = OT_GetStatusValue(unit, key) * val[key];
				plus += stateValue;
			}
		}
	}
	
	return Math.floor(plus);
};

// 攻撃アイテムにユニットや武器の攻撃力を加算
OT_getCustomItemPlus = function(unit, item) {
	var plus = 0;
	var weaponReflection = item.custom.OT_WeaponReflection;
	var weapon = ItemControl.getEquippedWeapon(unit);

	// ユニットステータスによる攻撃力加算
	plus = OT_getCustomItemValue(unit, item);

	// アイテムの攻撃力
	if(weaponReflection == true && weapon != null) {
		plus += weapon.getPow();
	}
	
	return plus;
};

// 攻撃アイテムの最終的な攻撃力を取得
OT_getCustomItemFinalDamage = function(unit, item) {
	// アイテムの攻撃力
	var damage = OT_getCustomItemDamage(item);

	// ユニットと装備武器の攻撃力
	damage += OT_getCustomItemPlus(unit, item);
	
	//ダメージ倍率を計算したものを返す
	return Math.floor(damage * OT_getCustomItemDamageMagnification(item));
};

// 最終的なダメージを計算する
OT_getCalculateDamageValue = function(item, targetUnit, damage, damageType, plus) {
	var unitTotalStatus = SupportCalculator.createTotalStatus(targetUnit);
	var def = 0;
	
	if (damageType === DamageType.PHYSICS || damageType === DamageType.MAGIC) {
		if(OT_getCustomItemCheckSupportDef(item) === true) {
			def = SupportCalculator.getDefense(unitTotalStatus);
		}
	}
	//root.log("ダメージ値："+damage);
	//root.log("防御支援："+def);
	return Calculator.calculateDamageValue(targetUnit, damage, damageType, -def);
};

// 攻撃アイテム使用時のアニメデータを取得
OT_getCustomItemAnimeData = function(item) {
	var anime = null;
	var animeID = OT_getCustomItemAnimeID(item);
	var runtime = OT_getCustomItemAnimeRuntime(item);
	
	if( animeID !== null )
	{
		var list = root.getBaseData().getEffectAnimationList(runtime);
		anime = list.getDataFromId(animeID);
	}
	
	return anime;
};


// 攻撃アイテム使用時のアニメのIDを取得
OT_getCustomItemAnimeID = function(item) {
	var AnimeData = item.custom.OT_EffectAnime;
	var AnimeID = null;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[0] === 'number')
		{
			AnimeID = AnimeData[0];
		}
	}
	
	return AnimeID;
};

// 攻撃アイテム使用時のアニメがランタイムか確認
OT_getCustomItemAnimeRuntime = function(item) {
	var AnimeData = item.custom.OT_EffectAnime;
	var runtime = true;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[1] === 'boolean' )
		{
			runtime = AnimeData[1];
		}
	}
	
	return runtime;
};

// 使用ダメージ時のアニメデータを取得
OT_getCustomItemUseDamageAnimeData = function(item) {
	var anime = null;
	var animeID = OT_getCustomItemUseDamageAnimeID(item);
	var runtime = OT_getCustomItemUseDamageAnimeRuntime(item);
	
	if( animeID !== null )
	{
		var list = root.getBaseData().getEffectAnimationList(runtime);
		anime = list.getDataFromId(animeID);
	}
	
	return anime;
};


// 使用ダメージ時のアニメのIDを取得
OT_getCustomItemUseDamageAnimeID = function(item) {
	var AnimeData = item.custom.OT_UseDamageAnime;
	var AnimeID = null;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[0] === 'number')
		{
			AnimeID = AnimeData[0];
		}
	}
	
	return AnimeID;
};

// 使用ダメージ時のアニメがランタイムか確認
OT_getCustomItemUseDamageAnimeRuntime = function(item) {
	var AnimeData = item.custom.OT_UseDamageAnime;
	var runtime = true;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[1] === 'boolean' )
		{
			runtime = AnimeData[1];
		}
	}
	
	return runtime;
};

// ヒット時のアニメデータを取得
OT_getCustomItemHitAnimeData = function(item) {
	var anime = null;
	var animeID = OT_getCustomItemHitAnimeID(item);
	var runtime = OT_getCustomItemHitAnimeRuntime(item);
	
	if( animeID !== null )
	{
		var list = root.getBaseData().getEffectAnimationList(runtime);
		anime = list.getDataFromId(animeID);
	}
	
	return anime;
};


// ヒット時のアニメのIDを取得
OT_getCustomItemHitAnimeID = function(item) {
	var AnimeData = item.custom.IER_HitAnime;
	var AnimeID = null;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[0] === 'number')
		{
			AnimeID = AnimeData[0];
		}
	}
	
	return AnimeID;
};

// ヒット時のアニメがランタイムか確認
OT_getCustomItemHitAnimeRuntime = function(item) {
	var AnimeData = item.custom.IER_HitAnime;
	var runtime = true;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[1] === 'boolean' )
		{
			runtime = AnimeData[1];
		}
	}
	
	return runtime;
};

// ミス時のアニメデータを取得
OT_getCustomItemMissAnimeData = function(item) {
	var anime = null;
	var animeID = OT_getCustomItemMissAnimeID(item);
	var runtime = OT_getCustomItemMissAnimeRuntime(item);
	
	if( animeID !== null )
	{
		var list = root.getBaseData().getEffectAnimationList(runtime);
		anime = list.getDataFromId(animeID);
	}
	
	return anime;
};


// ミス時のアニメのIDを取得
OT_getCustomItemMissAnimeID = function(item) {
	var AnimeData = item.custom.IER_MissAnime;
	var AnimeID = null;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[0] === 'number')
		{
			AnimeID = AnimeData[0];
		}
	}
	
	return AnimeID;
};

// ミス時のアニメがランタイムか確認
OT_getCustomItemMissAnimeRuntime = function(item) {
	var AnimeData = item.custom.IER_MissAnime;
	var runtime = true;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[1] === 'boolean' )
		{
			runtime = AnimeData[1];
		}
	}
	
	return runtime;
};

// GOODステート解除時のアニメデータを取得
OT_getCustomItemDeleteGoodAnimeData = function(item) {
	var anime = null;
	var animeID = OT_getCustomItemDeleteGoodAnimeID(item);
	var runtime = OT_getCustomItemDeleteGoodAnimeRuntime(item);
	
	if( animeID !== null )
	{
		var list = root.getBaseData().getEffectAnimationList(runtime);
		anime = list.getDataFromId(animeID);
	}
	
	return anime;
};


// GOODステート解除時のアニメのIDを取得
OT_getCustomItemDeleteGoodAnimeID = function(item) {
	var AnimeData = item.custom.IER_DelGoodAnime;
	var AnimeID = 200;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[0] === 'number')
		{
			AnimeID = AnimeData[0];
		}
	}
	
	return AnimeID;
};

// GOODステート解除時のアニメがランタイムか確認
OT_getCustomItemDeleteGoodAnimeRuntime = function(item) {
	var AnimeData = item.custom.IER_DelGoodAnime;
	var runtime = true;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[1] === 'boolean' )
		{
			runtime = AnimeData[1];
		}
	}
	
	return runtime;
};

// Badステート解除時のアニメデータを取得
OT_getCustomItemDeleteBadAnimeData = function(item) {
	var anime = null;
	var animeID = OT_getCustomItemDeleteBadAnimeID(item);
	var runtime = OT_getCustomItemDeleteBadAnimeRuntime(item);
	
	if( animeID !== null )
	{
		var list = root.getBaseData().getEffectAnimationList(runtime);
		anime = list.getDataFromId(animeID);
	}
	
	return anime;
};

// BADステート解除時のアニメのIDを取得
OT_getCustomItemDeleteBadAnimeID = function(item) {
	var AnimeData = item.custom.IER_DelBadAnime;
	var AnimeID = 101;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[0] === 'number')
		{
			AnimeID = AnimeData[0];
		}
	}
	
	return AnimeID;
};

// BADステート解除時のアニメがランタイムか確認
OT_getCustomItemDeleteBadAnimeRuntime = function(item) {
	var AnimeData = item.custom.IER_DelBadAnime;
	var runtime = true;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[1] === 'boolean' )
		{
			runtime = AnimeData[1];
		}
	}
	
	return runtime;
};

// 使用者のGOODステート解除時のアニメデータを取得
OT_getCustomItemUseDeleteGoodAnimeData = function(item) {
	var anime = null;
	var animeID = OT_getCustomItemUseDeleteGoodAnimeID(item);
	var runtime = OT_getCustomItemUseDeleteGoodAnimeRuntime(item);
	
	if( animeID !== null )
	{
		var list = root.getBaseData().getEffectAnimationList(runtime);
		anime = list.getDataFromId(animeID);
	}
	
	return anime;
};


// 使用者のGOODステート解除時のアニメのIDを取得
OT_getCustomItemUseDeleteGoodAnimeID = function(item) {
	var AnimeData = item.custom.OT_UseDelGoodAnime;
	var AnimeID = 200;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[0] === 'number')
		{
			AnimeID = AnimeData[0];
		}
	}
	
	return AnimeID;
};

// 使用者のGOODステート解除時のアニメがランタイムか確認
OT_getCustomItemUseDeleteGoodAnimeRuntime = function(item) {
	var AnimeData = item.custom.OT_UseDelGoodAnime;
	var runtime = true;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[1] === 'boolean' )
		{
			runtime = AnimeData[1];
		}
	}
	
	return runtime;
};

// 使用者のBadステート解除時のアニメデータを取得
OT_getCustomItemUseDeleteBadAnimeData = function(item) {
	var anime = null;
	var animeID = OT_getCustomItemUseDeleteBadAnimeID(item);
	var runtime = OT_getCustomItemUseDeleteBadAnimeRuntime(item);
	
	if( animeID !== null )
	{
		var list = root.getBaseData().getEffectAnimationList(runtime);
		anime = list.getDataFromId(animeID);
	}
	
	return anime;
};

// 使用者のBADステート解除時のアニメのIDを取得
OT_getCustomItemUseDeleteBadAnimeID = function(item) {
	var AnimeData = item.custom.OT_UseDelBadAnime;
	var AnimeID = 101;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[0] === 'number')
		{
			AnimeID = AnimeData[0];
		}
	}
	
	return AnimeID;
};

// 使用者のBADステート解除時のアニメがランタイムか確認
OT_getCustomItemUseDeleteBadAnimeRuntime = function(item) {
	var AnimeData = item.custom.OT_UseDelBadAnime;
	var runtime = true;
	
	if(AnimeData != null)
	{
		if( typeof AnimeData[1] === 'boolean' )
		{
			runtime = AnimeData[1];
		}
	}
	
	return runtime;
};

// 開始射程を取得
OT_getCustomItemRangeMin = function(item) {
	var Range = 0;
	if( typeof item.custom.OT_MinRange === 'number' )
	{
		Range = item.custom.OT_MinRange;
	}

	return Range;
};

// 終了射程を取得
OT_getCustomItemRangeMax = function(item) {
	var endRange = 0;
	
	rangeValue = item.getRangeValue();
	rangeType = item.getRangeType();

	if (rangeType === SelectionRangeType.SELFONLY) {
		endRange = 0;
	}
	else if (rangeType === SelectionRangeType.MULTI) {
		endRange = rangeValue;
	}
	else if (rangeType === SelectionRangeType.ALL) {
		endRange = CurrentMap.getWidth() + CurrentMap.getHeight();
	}

	return endRange;
};

// 回復系かを取得
OT_getCustomItemRecovery = function(item) {
	var value = false;
	if( typeof item.custom.OT_Recovery === 'boolean' )
	{
		value = item.custom.OT_Recovery;
	}

	return value;
};

// 使用後のダメージ量を取得
OT_getCustomItemUseDamage = function(item, unit) {
	var value = 0;
	if( typeof item.custom.OT_UseDamage === 'number' )
	{
		value = item.custom.OT_UseDamage;
	}
	else if(unit != null)
	{
		// 文字列で指定されてた場合
		if( typeof item.custom.OT_UseDamage === 'string' )
		{
			var str = item.custom.OT_UseDamage;
			var regex = /^(\-?)([0-9]+)\%$/;
			var regexM = /^(\-?)M([0-9]+)\%$/;
			if (str.match(regex))
			{
				var hp = unit.getHp();
				var val = parseInt(RegExp.$2);
				value = Math.floor( hp * (val / 100) );
				
				if(RegExp.$1 == '-')
				{
					value *= -1;
				}
			}
			else if (str.match(regexM))
			{
				var hp = ParamBonus.getMhp(unit);
				var val = parseInt(RegExp.$2);
				value = Math.floor( hp * (val / 100) );
				
				if(RegExp.$1 == '-')
				{
					value *= -1;
				}
			}
		}
	}

	return value;
};

// 使用後に消えるステートを取得
OT_getCustomItemUseDelState = function(item) {
	var value = [];
	var list = root.getBaseData().getStateList();

	if( typeof item.custom.OT_UseDelState === 'object' )
	{
		val = item.custom.OT_UseDelState;
		var add, k;
		
		for( key in val )
		{
			k = key;
			break;
		}

		// 文字列で指定されてた場合
		if( k == 'BadState' )
		{
			for( var i=0 ; i<list.getCount() ; i++ )
			{
				add = list.getDataFromId(i);
				if( add === null ) continue;
				if( add.isBadState() )
				{
					value.push( new Array( add, val[key] ) );
				}
			}
		}
		else if( k == 'GoodState' )
		{
			for( var i=0 ; i<list.getCount() ; i++ )
			{
				add = list.getDataFromId(i);
				if( add === null ) continue;
				if( add.isBadState() == false )
				{
					value.push( new Array( add, val[key] ) );
				}
			}
		}
		else if( k == 'AllState' )
		{
			for( var i=0 ; i<list.getCount() ; i++ )
			{
				add = list.getDataFromId(i);
				if( add === null ) continue;
				value.push( new Array( add, val[key] ) );
			}
		}
		else
		{
			try {
				for( key in val )
				{
					add = list.getDataFromId(key);
					if( add != null ) value.push( new Array( add, val[key] ) );
				}
			} catch(e) {
				root.msg('[範囲攻撃]解除ステートの指定が不正です。\nアイテムID:' + item.getId());
				root.endGame();
			}
		}
	}

	return value;
};

// 使用後に付与されるステートを取得
OT_getCustomItemUseAddState = function(item) {
	var value = [];
	var list = root.getBaseData().getStateList();

	if( typeof item.custom.OT_UseAddState === 'object' )
	{
		val = item.custom.OT_UseAddState;
		var add, k;
		
		for( key in val )
		{
			if(key == 'BadState' || key == 'GoodState' || key == 'AllState') {
				root.msg('[範囲攻撃]OT_UseAddStateの指定が不正です。\nOT_UseAddStateにはAllState、BadState、GoodStateは指定できません。\nアイテムID:' + item.getId());
				root.endGame();
			}
			
			add = list.getDataFromId(key);
			if( add != null )
			{
				value.push( new Array( add, val[key] ) );
				//root.log(add.getName());
				//root.log(val[key]);
			}
		}
	}

	return value;
};

// ユニットにステートを付与する(現在未使用)
OT_setCustomItemAddState = function(unit, targetUnit, addState) {
	var value = null;

	// ステートの追加
	for( var j=0 ; j<addState.length ; j++)
	{
		if( Probability.getProbability( addState[j][1] ) && StateControl.getTurnState( targetUnit, addState[j][0] ) === null )
		{
			// 耐性ステートを確認
			if (StateControl.isStateBlocked(targetUnit, unit, addState[j][0])) {
				// ステートは無効対象であるため発動しない
				continue;
			}
				
			StateControl.arrangeState(targetUnit, addState[j][0], IncreaseType.INCREASE);
			if( addState[j][0].isBadState() )
			{
				value = value | 0x02;
			}
			else
			{
				value = value | 0x01;
			}
		}
	}
	
	//root.log(value);
	return value;
};

// ユニットのステートを解除する
OT_setCustomItemDelState = function(unit, delState) {
	var value = null;

	// ステートの解除
	for( var j=0 ; j<delState.length ; j++)
	{
		if( Probability.getProbability( delState[j][1] ) && StateControl.getTurnState( unit, delState[j][0] ) !== null )
		{
			StateControl.arrangeState(unit, delState[j][0], IncreaseType.DECREASE);
			if( delState[j][0].isBadState() )
			{
				value = value | 0x01;
			}
			else
			{
				value = value | 0x02;
			}
		}
	}
	
	//root.log(value);
	return value;
};

// グッドステータスが含まれてるか
OT_getCustomItemisGoodState = function(array) {
	for( var i=0 ; i<array.length ; i++)
	{
		if( !array[i][0].isBadState() )
		{
			return true;
		}
	}
	
	return false;
};

// バッドステータスが含まれてるか
OT_getCustomItemisBadState = function(array) {
	for( var i=0 ; i<array.length ; i++)
	{
		if( array[i][0].isBadState() )
		{
			return true;
		}
	}
	
	return false;
};

// アニメの再生時の総カウント数を取得
OT_getCustomItemAnimeFrameCounter = function(anime) {
	
	var id = anime.getMotionIdFromIndex(0);
	var frame = anime.getFrameCount(id);
	var count = 0;

	for( var i=0 ; i<frame ; i++)
	{
		count += anime.getFrameCounterValue(id, i);
	}

	//root.log(id + ':' + frame + ':' + count);
	
	return count;
};

// ステータス取得
OT_GetStatusValue = function(unit, type) {
	var value = 0;
	
	// パラメータが宣言されている事を確認する
	if(!OT_isDefineParam(type))
	{
		return 0;
	}
	
	switch(type)
	{
		case OT_DefineStatus.LV:
			value = unit.getLv();
			break;

		case OT_DefineStatus.HP:
			value = unit.getHp();
			break;

		case OT_DefineStatus.EP:
			value = OT_GetNowEP(unit);
			break;

		case OT_DefineStatus.FP:
			value = OT_GetNowFP(unit);
			break;

		default:
			value = ParamBonus.getBonus(unit, ParamType[type]);
			break;
	}
	//root.log(value);
	return value;
};

OT_isDefineParam = function(type) {
	// レベルはスクリプトの定数で定義されている
	switch(type)
	{
		case OT_DefineStatus.LV:
			return true;
	}

	// 現在値と最大値が分かれているパラメータ
	for( var key in OT_NowStatusMapping )
	{
		if( type == OT_NowStatusMapping[key] )
		{
			if(typeof UnitParameter[key] == 'undefined')
			{
				//root.log(type + 'は未宣言のパラメータです。');
				return false;
			}
			return true;
		}
	}

	// パラメータが宣言されていない
	if(typeof UnitParameter[type] == 'undefined')
	{
		//root.log(type + 'は未宣言のパラメータです。');
		return false;
	}
	
	return true;
};

OT_getParamName = function( type ) {
	// パラメータの定義確認
	if( !OT_isDefineParam(type) )
	{
		return '';
	}

	// レベルはスクリプトの定数で定義されているため定数を返す
	switch(type)
	{
		case OT_DefineStatus.LV:
			return StringTable.Status_Level;
	}

	// 現在値と最大値が分かれているパラメータ
	for( var key in OT_NowStatusMapping )
	{
		if( type == key )
		{
			return '最大' + UnitParameter[key].getParameterName();
		}
		
		if( type == OT_NowStatusMapping[key] )
		{
			return UnitParameter[key].getParameterName();
		}
	}
	
	return UnitParameter[type].getParameterName();
};

//----------------------------------------------------------
// 範囲攻撃用
//----------------------------------------------------------
// 非ダメージ系であるかを取得
OT_getNoDamegeAttack = function(item) {
	var type = OT_getCustomItemType(item);
	var value = OT_getCustomItemDamage(item);
	
	if( type == DamageType.FIXED && value == 0 && item.custom.OT_WeaponReflection != true )
	{
		return true;
	}
	return false;
};

// アイテムの攻撃力を取得
OT_getCustomItemDamage = function(item) {
	var damage = 0;

	if ( typeof item.custom.IER_Value === 'number' )
	{
		damage = item.custom.IER_Value;
	}

	return damage;
};

// 範囲内のキャラに無差別に攻撃するか取得
OT_getCustomItemIndifference = function(item) {
	var indifference = false;
	
	if( item.custom.IER_Indifference != null )
	{
		indifference = item.custom.IER_Indifference;
	}
	
	return indifference;
};

// 効果範囲を取得
OT_getCustomItemEffectRange = function(item) {
	var startRange = 0;
	var endRange = 1;
	var Range = {};

	var str = item.custom.IER_EffectRange;
	if( typeof str === 'string' )
	{
		//root.log(str);
		var regex = /^([0-9]+)\-([0-9]+)$/;
		if (str.match(regex))
		{
			startRange = parseInt(RegExp.$1);
			endRange = parseInt(RegExp.$2);
			
			Range[0] = startRange;
			Range[1] = endRange;
			
			return Range;
		}
	}
	
	return null;
};

// 効果範囲最小値を取得
OT_getCustomItemEffectRangeMin = function(item) {
	var Range = 0;
	var RangeData = OT_getCustomItemEffectRange(item);
	
	if( RangeData != null )
	{
		Range = RangeData[0];
	}

	return Range;
};

// 効果範囲最大値を取得
OT_getCustomItemEffectRangeMax = function(item) {
	var Range = 0;
	var RangeData = OT_getCustomItemEffectRange(item);
	
	if( RangeData != null )
	{
		Range = RangeData[1];
	}

	return Range;
};

// 相手に当てた時の取得経験値の倍率取得
OT_getCustomItemEXPMagnification = function(item) {
	var Magnification = 1;

	if ( typeof item.custom.IER_EXPMagnification === 'number' )
	{
		Magnification = item.custom.IER_EXPMagnification;
	}

	return Magnification;
};

// 射程タイプの取得
OT_getCustomItemRangeType = function(item) {
	var value = 0;

	if ( typeof item.custom.IER_RangeType === 'number' )
	{
		value = item.custom.IER_RangeType;
	}

	return value;
};

// 範囲タイプの取得
OT_getCustomItemEffectRangeType = function(item) {
	var value = 0;

	if ( typeof item.custom.IER_EffectRangeType === 'number' )
	{
		value = item.custom.IER_EffectRangeType;
	}

	return value;
};


// 射程の広がり方の調整値の取得
OT_getCustomItemRangeSpread = function(item) {
	var value = 1;

	if ( typeof item.custom.IER_RangeSpread === 'number' )
	{
		value = item.custom.IER_RangeSpread;
	}

	if( value < 1 ) value = 1;

	return value;
};

// 範囲の広がり方の調整値の取得
OT_getCustomItemEffectSpread = function(item) {
	var value = 1;

	if ( typeof item.custom.IER_EffectSpread === 'number' )
	{
		value = item.custom.IER_EffectSpread;
	}

	if( value < 1 ) value = 1;

	return value;
};

// 当たった対象の消えるステートを取得
OT_getCustomItemDelState = function(item) {
	var value = [];
	var list = root.getBaseData().getStateList();

	if( typeof item.custom.IER_DelState === 'object' )
	{
		val = item.custom.IER_DelState;
		var add, k;
		
		for( key in val )
		{
			k = key;
			break;
		}

		// 文字列で指定されてた場合
		if( k == 'BadState' )
		{
			for( var i=0 ; i<list.getCount() ; i++ )
			{
				add = list.getDataFromId(i);
				if( add === null ) continue;
				
				if( add.isBadState() )
				{
					value.push( new Array( add, val[key] ) );
				}
			}
		}
		else if( k == 'GoodState' )
		{
			for( var i=0 ; i<list.getCount() ; i++ )
			{
				add = list.getDataFromId(i);
				if( add === null ) continue;
				
				if( add.isBadState() == false )
				{
					value.push( new Array( add, val[key] ) );
				}
			}
		}
		else if( k == 'AllState' )
		{
			for( var i=0 ; i<list.getCount() ; i++ )
			{
				add = list.getDataFromId(i);
				if( add === null ) continue;
				value.push( new Array( add, val[key] ) );
			}
		}
		else
		{
			try {
				for( key in val )
				{
					add = list.getDataFromId(key);
					if( add != null ) value.push( new Array( add, val[key] ) );
				}
			} catch(e) {
				root.msg('[範囲攻撃]解除ステートの指定が不正です。\nアイテムID:' + item.getId());
				root.endGame();
			}
		}
	}

	return value;
};

// 当たった対象に付与されるステートを取得
OT_getCustomItemAddState = function(item) {
	var value = [];
	var list = root.getBaseData().getStateList();

	if( typeof item.custom.IER_AddState === 'object' )
	{
		val = item.custom.IER_AddState;
		var add, k;
		
		for( key in val )
		{
			if(key == 'BadState' || key == 'GoodState' || key == 'AllState') {
				root.msg('[範囲攻撃]IER_AddStateの指定が不正です。\IER_AddStateにはAllState、BadState、GoodStateは指定できません。\nアイテムID:' + item.getId());
				root.endGame();
			}
			add = list.getDataFromId(key);
			if( add != null )
			{
				value.push( new Array( add, val[key] ) );
				//root.log(add.getName());
				//root.log(val[key]);
			}
		}
	}

	return value;
};

// ユニットの向き取得
OT_getUnitDirection = function(x, y, px, py) {
	var value = 0;
	
	// 相対位置を取得
	var pointX = px - x;
	var pointY = py - y;
	
	// 相対座標が0,0なら-1を返す
	if( pointX == 0 && pointY == 0 ) return -1;

	// 丁度斜めなら絶対値が等しくなる
	if( Math.abs(pointX) == Math.abs(pointY) )
	{
		if( pointX < 0 )
		{
			if( pointY < 0 )
			{
				return OT_SLANTING + 0;
			}
			else if( pointY > 0 )
			{
				return OT_SLANTING + 3;
			}
		}
		else if( pointX > 0 )
		{
			if( pointY < 0 )
			{
				return OT_SLANTING + 1;
			}
			else if( pointY > 0 )
			{
				return OT_SLANTING + 2;
			}
		}
	}
	else if(Math.abs(pointX) > Math.abs(pointY))
	{
		if( pointX < 0 )
		{
			return DirectionType.LEFT;
		}
		else
		{
			return DirectionType.RIGHT;
		}
	}
	else if(Math.abs(pointX) < Math.abs(pointY))
	{
		if( pointY < 0 )
		{
			return DirectionType.TOP;
		}
		else
		{
			return DirectionType.BOTTOM;
		}
	}
	
	return -1;
};

// 命中率がユニットの回避率で変動するか
OT_getCustomItemHitAvoid = function(item) {
	var value = false;
	if( typeof item.custom.IER_HitAvoid === 'boolean' )
	{
		value = item.custom.IER_HitAvoid;
	}

	return value;
};

// 命中率を取得
OT_getCustomItemHitValue = function(item) {
	var value = 100;
	if( typeof item.custom.IER_HitValue === 'number' )
	{
		value = item.custom.IER_HitValue;
	}

	return value;
};

// 命中率がユニット依存か調べる
OT_getCustomItemHITReflectionUnit = function(item) {
	var Data = item.custom.IER_HitReflection;
	var value = false;
	
	if(Data != null)
	{
		if( typeof Data[0] === 'boolean' )
		{
			value = Data[0];
		}
	}
	
	return value;
};

// 命中率が武器依存か調べる
OT_getCustomItemHITReflectionWeapon = function(item) {
	var Data = item.custom.IER_HitReflection;
	var value = false;
	
	if(Data != null)
	{
		if( typeof Data[1] === 'boolean' )
		{
			value = Data[1];
		}
	}
	
	return value;
};


// 実際の命中率を取得
OT_getCustomItemHitPercent = function(unit, targetUnit, item) {
	var hit, avoid, percent;
	var unitTotalStatus = SupportCalculator.createTotalStatus(unit);
	var targetUnitTotalStatus = SupportCalculator.createTotalStatus(targetUnit);
	var weapon = ItemControl.getEquippedWeapon(unit);
	
	hit = OT_getCustomItemHitValue(item);
	avoid = 0;
	
	// 使用者の命中率が反映される場合は命中率に加算
	if( OT_getCustomItemHITReflectionUnit(item) ) {
		hit += (RealBonus.getSki(unit) * 3);
		if( OT_getCustomItemCheckSupportHit(item) == true ) {
			hit += SupportCalculator.getHit(unitTotalStatus);
		}
	}

	// 武器の命中率が反映される場合は加算させる
	if( OT_getCustomItemHITReflectionWeapon(item) && weapon != null ) {
		hit += weapon.getHit();
	}

	// 相手の回避値が反映される場合は加算
	if( OT_getCustomItemHitAvoid(item) ) {
		avoid = AbilityCalculator.getAvoid(targetUnit);
		if( OT_getCustomItemCheckSupportAgi(item) === true ) {
			avoid += SupportCalculator.getAvoid(targetUnitTotalStatus);
		}
	}

	// 命中率の計算を行う
	percent = hit - avoid;
	
	//root.log("命中支援："+SupportCalculator.getHit(unitTotalStatus));
	//root.log("回避支援："+SupportCalculator.getAvoid(targetUnitTotalStatus));
	//root.log("命中率："+hit);
	//root.log("回避率："+avoid);

	
	//root.log('命中率:'+percent);
	
	return HitCalculator.validValue(unit, targetUnit, weapon, percent);
};

// 命中するかを判定
OT_getCustomItemHitCheck = function(unit, targetUnit, item) {
	return Probability.getProbability( OT_getCustomItemHitPercent(unit, targetUnit, item) );
};


// 支援効果による攻撃補正が反映されるかを判定
OT_getCustomItemCheckSupportAtk = function(item) {
	var value = true;
	if( typeof item.custom.IER_SupportAtk === 'boolean' ) {
		value = item.custom.IER_SupportAtk;
	}
	return value;
};

// 支援効果による命中補正が反映されるかを判定
OT_getCustomItemCheckSupportHit = function(item) {
	var value = true;
	if( typeof item.custom.IER_SupportHit === 'boolean' ) {
		value = item.custom.IER_SupportHit;
	}
	return value;
};

// 支援効果による防御補正が反映されるかを判定
OT_getCustomItemCheckSupportDef = function(item) {
	var value = true;
	if( typeof item.custom.IER_SupportDef === 'boolean' ) {
		value = item.custom.IER_SupportDef;
	}
	return value;
};

// 支援効果による回避補正が反映されるかを判定
OT_getCustomItemCheckSupportAgi = function(item) {
	var value = true;
	if( typeof item.custom.IER_SupportAgi === 'boolean' ) {
		value = item.custom.IER_SupportAgi;
	}
	return value;
};

// 効果範囲内のマップチップを変更する
OT_isCustomItemMapChipChange = function(chip, terrain) {
	var value = false;
	var data = terrain.custom.IER_MapChipChangeGroup;
	
	if( chip[0] == 'ALL' ) return true;
	
	if( typeof data === 'object' )
	{
		for( var i=0 ; i<data.length ; i++ )
		{
			if( chip[0] == data[i] )
			{
				return true;
			}
		}
	}

	return false;
};

// 効果範囲内の変更後のマップチップのデータ
OT_getCustomItemMapChipChangeDate = function(item) {
	var value = null;
	var data = item.custom.IER_MapChipChangeAfter;
	if( typeof data === 'object' )
	{
		value = data;
	}

	return value;
};

// 特定座標が推測射程範囲内に入っているか
OT_getPointinGuessRange = function(x, y, px, py, startRange, endRange) {
	
	var ax = Math.abs( x - px );
	var ay = Math.abs( y - py );
	
	if( startRange <= ax && ax <= endRange )
	{
		if( startRange <= ay && ay <= endRange )
		{
			//root.log(ax+ ':' +ay);
			return true;
		}
	}


	return false;
};

// 範囲攻撃用の座標を設定
OT_getMapAnimationIERPos = function(x, y) {
	x -= 80;
	y -= 160;
	
	return createPos(x, y);
};


//----------------------------------------------------------
// 効果範囲用パネル
//----------------------------------------------------------
MapLayer.OT_EffectRangePanel = null;

MapLayer.OT_getEffectRangePanel = function() {
	return this.OT_EffectRangePanel;
};

var alias2 = MapLayer.prepareMapLayer;
MapLayer.prepareMapLayer = function() {
	alias2.call(this);
	this.OT_EffectRangePanel = createObject(MapChipLight);
	this.OT_EffectRangePanel.setLightType(MapLightType.RANGE);
};

var alias3 = MapLayer.moveMapLayer;
MapLayer.moveMapLayer = function() {
	this.OT_EffectRangePanel.moveLight();
	return alias3.call(this);
};

var alias4 = MapLayer.drawUnitLayer;
MapLayer.drawUnitLayer =  function() {
	alias4.call(this);
	this.OT_EffectRangePanel.drawLight();
};


//----------------------------------------------------------
// 効果範囲用のインデックス作成
//----------------------------------------------------------
//十字架
OT_getCrossIndexArray = function(x, y, startRange, endRange, spread) {
	var array = [];

	for( var i=0 ; i<=4 ; i++ )
	{
		Array.prototype.push.apply( array, OT_getLineIndexArray(x, y, startRange, endRange, i, spread) );
	}
	
	return unique(array);
};

//一直線
OT_getLineIndexArray = function(x, y, startRange, endRange, direction, spread) {
	var array = [];
	var index = -1;
	
	for( var j=0 ; j<spread ; j++ )
	{
		for( var i=startRange ; i<=endRange ; i++ )
		{
			switch(direction) {
				case DirectionType.LEFT:
					index = CurrentMap.getIndex(x-i, y-j);
					break;
	
				case DirectionType.TOP:
					index = CurrentMap.getIndex(x-j, y-i);
					break;
	
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x+i, y-j);
					break;
	
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x-j, y+i);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}

			switch(direction) {
				case DirectionType.LEFT:
					index = CurrentMap.getIndex(x-i, y+j);
					break;
	
				case DirectionType.TOP:
					index = CurrentMap.getIndex(x+j, y-i);
					break;
	
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x+i, y+j);
					break;
	
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x+j, y+i);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}
		}
	}
	
	return unique(array);
};

//×型
OT_getXCrossIndexArray = function(x, y, startRange, endRange, spread) {
	var array = [];

	for( var i=0 ; i<=4 ; i++ )
	{
		Array.prototype.push.apply( array, OT_getDiagonalIndexArray(x, y, startRange, endRange, i, spread) );
	}
	
	return unique(array);
};

//斜め線
OT_getDiagonalIndexArray = function(x, y, startRange, endRange, direction, spread) {
	var array = [];
	var index = -1;
	
	for( var j=0 ; j<spread ; j++ )
	{
		var point1 = Math.floor( (1+j) / 2 );
		var point2 = Math.floor( (j) / 2 );
		for( var i=startRange ; i<=endRange ; i++ )
		{
			switch(direction) {
				//左上
				case DirectionType.LEFT:
					index = CurrentMap.getIndex(x-i-point2, y-i+point1);
					break;
	
				//右上
				case DirectionType.TOP:
					index = CurrentMap.getIndex(x+i-point1, y-i-point2);
					break;
	
				//右下
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x+i+point2, y+i-point1);
					break;
	
				//左下
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x-i+point1, y+i+point2);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}

			switch(direction) {
				//左上
				case DirectionType.LEFT:
					index = CurrentMap.getIndex(x-i+point1, y-i-point2);
					break;
	
				//右上
				case DirectionType.TOP:
					index = CurrentMap.getIndex(x+i+point2, y-i+point1);
					break;
	
				//右下
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x+i-point1, y+i+point2);
					break;
	
				//左下
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x-i-point2, y+i-point1);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}
		}
	}
	
	return unique(array);
};

//＋×型
OT_getDoubleCrossIndexArray = function(x, y, startRange, endRange, spread) {
	var array = [];

	for( var i=0 ; i<=4 ; i++ )
	{
		Array.prototype.push.apply( array, OT_getLineIndexArray(x, y, startRange, endRange, i, spread) );
		Array.prototype.push.apply( array, OT_getDiagonalIndexArray(x, y, startRange, endRange, i, spread) );
	}
	
	return unique(array);
};

//ブレス型
OT_getBreathIndexArray = function(x, y, startRange, endRange, direction, spread) {
	var array = [];
	var index = -1;
	
	for( var i=startRange ; i<=endRange ; i++ )
	{
		var point = Math.floor( (i + spread - 1) / spread );

		switch(direction) {
			case DirectionType.LEFT:
				Array.prototype.push.apply( array, OT_getHorizontalLineIndexArray(x-i, y, 0, point, direction, 1) );
				break;

			case DirectionType.TOP:
				Array.prototype.push.apply( array, OT_getHorizontalLineIndexArray(x, y-i, 0, point, direction, 1) );
				break;

			case DirectionType.RIGHT:
				Array.prototype.push.apply( array, OT_getHorizontalLineIndexArray(x+i, y, 0, point, direction, 1) );
				break;

			case DirectionType.BOTTOM:
				Array.prototype.push.apply( array, OT_getHorizontalLineIndexArray(x, y+i, 0, point, direction, 1) );
				break;
		}
		
	}
	
	return unique(array);
};

//ブレス型(斜め)
OT_getDiagonalBreathIndexArray = function(x, y, startRange, endRange, direction, spread) {
	var array = [];
	var index = -1;
	
	for( var i=startRange ; i<=endRange ; i++ )
	{

		switch(direction) {
			case DirectionType.LEFT:
				Array.prototype.push.apply( array, OT_getLineIndexArray(x-i, y-i, 0, endRange-i*2, DirectionType.LEFT, 1 ) );
				Array.prototype.push.apply( array, OT_getLineIndexArray(x-i, y-i, 0, endRange-i*2, DirectionType.TOP , 1 ) );
				break;

			case DirectionType.TOP:
				Array.prototype.push.apply( array, OT_getLineIndexArray(x+i, y-i, 0, endRange-i*2, DirectionType.RIGHT, 1 ) );
				Array.prototype.push.apply( array, OT_getLineIndexArray(x+i, y-i, 0, endRange-i*2, DirectionType.TOP  , 1 ) );
				break;

			case DirectionType.RIGHT:
				Array.prototype.push.apply( array, OT_getLineIndexArray(x+i, y+i, 0, endRange-i*2, DirectionType.RIGHT  , 1 ) );
				Array.prototype.push.apply( array, OT_getLineIndexArray(x+i, y+i, 0, endRange-i*2, DirectionType.BOTTOM , 1 ) );
				break;

			case DirectionType.BOTTOM:
				Array.prototype.push.apply( array, OT_getLineIndexArray(x-i, y+i, 0, endRange-i*2, DirectionType.LEFT   , 1 ) );
				Array.prototype.push.apply( array, OT_getLineIndexArray(x-i, y+i, 0, endRange-i*2, DirectionType.BOTTOM , 1 ) );
				break;
		}
		
	}
	
	return unique(array);
};

//ブレス(全方位)
OT_getAllBreathIndexArray = function(x, y, startRange, endRange, spread) {
	var array = [];

	Array.prototype.push.apply( array, OT_getBreathIndexArray( x-1, y, startRange, endRange, 0, spread ) );
	Array.prototype.push.apply( array, OT_getBreathIndexArray( x, y-1, startRange, endRange, 1, spread ) );
	Array.prototype.push.apply( array, OT_getBreathIndexArray( x+1, y, startRange, endRange, 2, spread ) );
	Array.prototype.push.apply( array, OT_getBreathIndexArray( x, y+1, startRange, endRange, 3, spread ) );
	
	return unique(array);
};

//横一文字
OT_getHorizontalLineIndexArray = function(x, y, startRange, endRange, direction, spread) {
	var array = [];
	var index = -1;
	for( var j=0 ; j<spread ; j++ )
	{
		for( var i=startRange ; i<=endRange ; i++ )
		{
			switch(direction) {
				case DirectionType.LEFT:
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x - j, y - i);
					break;
	
				case DirectionType.TOP:
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x - i, y - j);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}

			switch(direction) {
				case DirectionType.LEFT:
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x + j, y - i);
					break;
	
				case DirectionType.TOP:
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x - i, y + j);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}
	
			switch(direction) {
				case DirectionType.LEFT:
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x - j, y + i);
					break;
	
				case DirectionType.TOP:
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x + i, y - j);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}
			
			switch(direction) {
				case DirectionType.LEFT:
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x + j, y + i);
					break;
	
				case DirectionType.TOP:
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x + i, y + j);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}
		}
	}
	return unique(array);
};

//横一文字(斜め)
OT_getDiagonalHorizontalLineIndexArray = function(x, y, startRange, endRange, direction, spread) {
	var array = [];
	var index = -1;
	for( var j=0 ; j<spread ; j++ )
	{
		var point1 = Math.floor( (1+j) / 2 );
		var point2 = Math.floor( (j) / 2 );
		for( var i=startRange ; i<=endRange ; i++ )
		{
			switch(direction) {
				case DirectionType.LEFT:
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x + i - point2, y - i - point1);
					break;
	
				case DirectionType.TOP:
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x - i - point1, y - i + point2);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}

			switch(direction) {
				case DirectionType.LEFT:
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x + i + point1, y - i + point2);
					break;
	
				case DirectionType.TOP:
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x - i + point2, y - i - point1);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}
	
			switch(direction) {
				case DirectionType.LEFT:
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x - i - point1, y + i - point2);
					break;
	
				case DirectionType.TOP:
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x + i + point1, y + i - point2);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}
			
			switch(direction) {
				case DirectionType.LEFT:
				case DirectionType.RIGHT:
					index = CurrentMap.getIndex(x - i + point2, y + i + point1);
					break;
	
				case DirectionType.TOP:
				case DirectionType.BOTTOM:
					index = CurrentMap.getIndex(x + i - point2, y + i + point1);
					break;
			}
			
			if(index != -1)
			{
				array.push(index);
			}
		}
	}
	return unique(array);
};

//四角
OT_getBoxIndexArray = function(x, y, startRange, endRange) {
	var array = [];
	var index = -1;
	var count = 1 + endRange*2;
	var ax = 0;
	var ay = 0;
	
	for( var i=-endRange ; i<=endRange ; i++ )
	{
		ax =  Math.abs( i );
		if( startRange > ax ) continue;

		for( var j=-endRange ; j<=endRange ; j++ )
		{
			ay =  Math.abs( j );
			if( startRange > ay ) continue;
			
			index = CurrentMap.getIndex(x+i, y+j);
			if(index != -1)
			{
				array.push(index);
			}
		}
	}
	
	return array;
};

//----------------------------------------------------------
// 便利な関数群
//----------------------------------------------------------
// 配列の重複を削除
function unique(array) {
	var storage = {};
	var uniqueArray = [];
	var i,value;
	for ( i=0; i<array.length; i++) {
		value = array[i];
		if (!(value in storage))
		{
			storage[value] = true;
			uniqueArray.push(value);
		}
	}
	return uniqueArray;
};

})();

