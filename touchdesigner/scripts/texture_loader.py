def _owner():
    return me.parent()


def _op(name):
    operator = _owner().op(name)
    if operator is None:
        raise RuntimeError(
            'Texture loader could not find "{}" inside {}'.format(
                name,
                _owner().path,
            )
        )
    return operator


def _pathsFromFolder():
    dat = _op('folder_sorted')
    pathColumn = dat.col('path')
    if pathColumn is None:
        raise RuntimeError('folder_sorted does not have a "path" column')

    return [
        cell.val
        for cell in pathColumn[1:]
        if cell.val.lower().endswith('.png')
    ]


def _getRegistry():
    return _op('texture_registry')


def _resetRegistry():
    registry = _getRegistry()
    registry.clear()
    registry.appendRow(['path', 'slice'])
    return registry


def _registeredPaths():
    registry = _getRegistry()

    if registry.numRows <= 1:
        return set()

    pathHeader = next(
        cell.val
        for cell in registry.row(0)
        if cell.val.strip().lower() == 'path'
    )
    pathColumn = registry.col(pathHeader)

    return {cell.val for cell in pathColumn[1:]}


def syncQueue():
    owner = _owner()
    queue = owner.fetch('textureQueue', [])
    registered = _registeredPaths()

    current = owner.fetch('currentTexturePath', '')
    alreadyQueued = set(queue)

    for path in _pathsFromFolder():
        if (
            path not in registered
            and path not in alreadyQueued
            and path != current
        ):
            queue.append(path)
            alreadyQueued.add(path)

    owner.store('textureQueue', queue)
    debug('Texture loader queued {} PNGs'.format(
        len(owner.fetch('textureQueue', []))
    ))


def start():
    """Rebuild the GPU texture array from every PNG in folder_sorted."""
    owner = _owner()
    _resetRegistry()

    owner.store('textureQueue', [])
    owner.store('textureLoadState', 'idle')
    owner.store('currentTexturePath', '')
    owner.store('currentTextureSlice', 0)

    _op('tex3d1').par.active = False
    syncQueue()


def update():
    owner = _owner()
    movie = _op('load_flower_png')
    texture = _op('tex3d1')
    texture2 = _op('tex3d2')
    registry = _getRegistry()

    state = owner.fetch('textureLoadState', 'idle')
    queue = owner.fetch('textureQueue', [])

    if state == 'idle':
        if not queue:
            return

        nextSlice = registry.numRows - 1

        if nextSlice >= int(texture.par.cachesize):
            debug('Texture array is full')
            return

        path = queue.pop(0)

        owner.store('textureQueue', queue)
        owner.store('currentTexturePath', path)
        owner.store('currentTextureSlice', nextSlice)

        # Clearing prevents the previous image's ready state being reused.
        movie.par.file = ''
        owner.store('textureLoadState', 'setfile')
        return

    if state == 'setfile':
        path = owner.fetch('currentTexturePath', '')

        movie.par.file = path
        movie.par.reloadpulse.pulse()

        owner.store('textureLoadState', 'loading')
        return

    if state == 'loading':
        if movie.isOpen and movie.isFullyPreRead:
            # Wait until the following frame before copying.
            owner.store('textureLoadState', 'copy')
        return

    if state == 'copy':
        path = owner.fetch('currentTexturePath', '')
        sliceIndex = owner.fetch('currentTextureSlice', 0)

        for t in (texture, texture2):
            t.par.active = False
            t.par.replaceindex = sliceIndex
            t.par.replacesinglepulse.pulse()

        registry.appendRow([path, sliceIndex])

        owner.store('currentTexturePath', '')
        owner.store('textureLoadState', 'idle')
