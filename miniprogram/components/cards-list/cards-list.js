Component({
  properties: {
    list: { type: Array, value: [] },
    selectedSet: { type: Object, value: {} },
    favoritesById: { type: Object, value: {} },
    animatingFavoriteId: { type: Number, value: 0 },
    disableFavoriteActions: { type: Boolean, value: false },
    isEditing: { type: Boolean, value: false }
  },
  methods: {
    onRowTap(e) { this.triggerEvent('rowtap', { id: e.currentTarget.dataset.id }) },
    onToggleFavorite(e) { this.triggerEvent('togglefavorite', { id: e.currentTarget.dataset.id }) },
    onInquiry(e) { this.triggerEvent('inquiry', { id: e.currentTarget.dataset.id }) }
  }
});
