(() => {
  let controller
  let loading

  const loadSearch = () => {
    if (controller) return Promise.resolve(controller)
    if (loading) return loading

    const assets = GLOBAL_CONFIG.algoliaAssets
    if (!assets) return Promise.reject(new Error('Algolia assets are unavailable.'))

    loading = btf.getScript(assets.client)
      .then(() => btf.getScript(assets.instantSearch))
      .then(() => btf.getScript(assets.runtime))
      .then(() => {
        if (!window.btfAlgoliaSearch) throw new Error('Algolia runtime did not initialize.')
        controller = window.btfAlgoliaSearch.mount()
        return controller
      })
      .catch(error => {
        loading = null
        console.error('Unable to load Algolia search:', error)
        throw error
      })

    return loading
  }

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return
    if (!event.target.closest('#search-button > .search')) return

    event.preventDefault()
    loadSearch().then(search => search.open())
  })
})()
