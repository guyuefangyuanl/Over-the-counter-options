Component({
  properties: { active: { type: String, value: 'self' } },
  methods: {
    onSwitch(e) {
      const tab = e.currentTarget.dataset.tab
      this.triggerEvent('change', { tab })
    }
  }
});
