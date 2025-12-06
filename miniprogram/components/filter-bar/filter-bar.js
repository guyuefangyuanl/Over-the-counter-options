Component({
  properties: {
    keyword: { type: String, value: '' },
    activeTerm: { type: String, value: '1M' },
    activeStructure: { type: String, value: 'vanilla' }
  },
  methods: {
    onInput(e) { this.triggerEvent('searchinput', { value: e.detail.value }) },
    onConfirm() { this.triggerEvent('searchconfirm') },
    onClear() { this.triggerEvent('clear') },
    onOpenSearch() { this.triggerEvent('opensearch') },
    onSwitchTerm(e) { this.triggerEvent('switchterm', { term: e.currentTarget.dataset.term }) },
    onSwitchStructure(e) { this.triggerEvent('switchstructure', { structure: e.currentTarget.dataset.structure }) },
    onInfo() { this.triggerEvent('info') }
  }
});
