var WEPUSE001 = ItemTitleFlowEntry.drawFlowEntry;
ItemTitleFlowEntry.drawFlowEntry = function() {
	var x, y;
	var itemTargetInfo = this._itemUseParent.getItemTargetInfo();
	var textui = root.queryTextUI('itemuse_title');
	var color = textui.getColor();
	var font = textui.getFont();
	var pic = textui.getUIImage();
	var text;
	if (itemTargetInfo.item.isWeapon()){
		if (itemTargetInfo.item.custom.UseText != null){
			text = itemTargetInfo.item.custom.UseText;
		}
		else{
			text = itemTargetInfo.item.getName();
		}
		var width = (TitleRenderer.getTitlePartsCount(text, font) + 2) * TitleRenderer.getTitlePartsWidth();

		x = LayoutControl.getUnitCenterX(itemTargetInfo.unit, width, 0);
		y = LayoutControl.getUnitBaseY(itemTargetInfo.unit, TitleRenderer.getTitlePartsHeight()) - 20;

		TextRenderer.drawTitleText(x, y, text, color, font, TextFormat.CENTER, pic);
	}
	else{
		WEPUSE001.call(this)
	}
};

var WEPUSE002 = ItemWorkWindow.setItemWorkData;
ItemWorkWindow.setItemWorkData = function(item){
	if (item.isWeapon()) {
		arr = [StringTable.ItemWork_Equipment, StringTable.ItemWork_Use, StringTable.ItemWork_Discard];
		this._scrollbar.setObjectArray(arr);
	}
	else{
		WEPUSE002.call(this,item);
	}
};

var WEPUSE003 = ItemSelectMenu.isWorkAllowed;
ItemSelectMenu.isWorkAllowed = function(index) {
	var result = WEPUSE003.call(this,index);
	var item = this._itemListWindow.getCurrentItem();
	if (item.isWeapon()) {
		if (index === 0) {
			result = ItemControl.isWeaponAvailable(this._unit, item);
		}
		else if (index === 1){
			result = this._isItemUsable(item);
		}
		else if (index === 2) {
			result = !item.isImportance();
		}
	}
	return result;
};

var WEPUSE004 = ItemSelectMenu._doWorkAction;
ItemSelectMenu._doWorkAction = function(index) {
	var item = this._itemListWindow.getCurrentItem();
	var result = WEPUSE004.call(this,index);
	
	if (item.isWeapon()) {
		if (index === 0) {
			ItemControl.setEquippedWeapon(this._unit, item);
			this._resetItemList();
			this._processMode(ItemSelectMenuMode.ITEMSELECT);
		}
		else if (index === 1) {
			result = ItemSelectMenuResult.USE;
		}
		else if (index === 2) {
			this._processMode(ItemSelectMenuMode.DISCARD);
		}
	}
	return result;
};

var WEPUSE005 = ItemSelectMenu._isItemUsable;
ItemSelectMenu._isItemUsable = function(item) {
	var obj;
	var result = WEPUSE005.call(this,item);
	if (item.isWeapon() && item === ItemControl.getEquippedWeapon(this._unit) && item.custom.Splash){
		result = true;
	}
	return result;
};

var WEPUSE006 = ItemPackageControl.getItemSelectionObject;
ItemPackageControl.getItemSelectionObject = function(item){
	var obj;
	if (item.isWeapon()){
		obj = this.getCustomItemSelectionObject(item,"OT_ItemEffectRange");
	}
	else{
		obj = WEPUSE006.call(this,item);
	}
	return createObject(obj)
};

var WEPUSE007 = OT_EffectRangeIndexArray.createIndexArray;
OT_EffectRangeIndexArray.createIndexArray = function(x, y, item) {
	if (item.isWeapon()){
		var i, rangeValue, rangeType, arr;
		var startRange = item.custom.OT_MinRange;
		var endRange = item.custom.OT_MaxRange;
		var count = 1;
		
		if (startRange > endRange){
			startRange = endRange;
		}
		
		var RangeType = OT_getCustomItemRangeType(item);
		
		return this.getRangeIndexArray(x, y, startRange, endRange, RangeType, OT_getCustomItemRangeSpread(item));
	}
	else{
		WEPUSE007.call(this,x,y,item);
	}
};

var WEPUSE008 = ItemPackageControl.getItemUseParent;
ItemPackageControl.getItemUseParent = function(item) {
	var obj, parent;
	var type;
	
	if (!item.isWeapon()){
		return WEPUSE008.call(this,item);
	}
	
	obj = this.getCustomItemUseObject(item, 'OT_ItemEffectRange');
	parent = createObject(ItemUseParent);
	parent._itemUseObject = createObject(obj);
	
	return parent;
};

var WEPUSE009 = ItemMainFlowEntry._completeMemberData;
ItemMainFlowEntry._completeMemberData = function(itemUseParent) {
	var animeData;
	var pos;
	
	if (!itemUseParent.getItemTargetInfo().item.isWeapon()){
		return WEPUSE009.call(this,itemUseParent);
	}
	return this._changeMainUse() ? EnterResult.OK : EnterResult.NOTENTER;
};

var WEPUSE010 = ItemExpFlowEntry._getItemExperience;
ItemExpFlowEntry._getItemExperience = function(itemUseParent) {
	var exp;
	var itemTargetInfo = itemUseParent.getItemTargetInfo();
	var unit = itemTargetInfo.unit;
	if (!itemTargetInfo.item.isWeapon()){
		return WEPUSE010.call(this,itemUseParent);
	}
	return 0;
};

var WEPUSE011 = ItemExpFlowEntry._getItemExperience;
ItemExpFlowEntry._getItemExperience = function(itemUseParent) {
	var exp = WEPUSE011.call(this,itemUseParent);
	if (itemUseParent.getItemTargetInfo().item.isWeapon()){
		exp = itemUseParent.getItemTargetInfo().item.custom.OT_EXPGain
	}
	if (exp > 100){
		exp = 100
	}
	else if (exp < 0) {
		exp = 0;
	}

	return exp;
};